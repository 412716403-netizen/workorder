const { readOperatorDisplayName, readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { dispatchRowKey } = require('../../utils/outsourceDispatchLite.js');
const {
  buildDispatchBatchPayload,
} = require('../../utils/outsourceConfirm.js');
const {
  buildDefaultDispatchQuantities,
  buildDispatchVariantMaxMap,
  buildOutsourceDispatchMatrixLayout,
  computeOutsourceCellMaxAllowed,
  resolveDispatchRowMatrixContext,
  variantQuantityKey,
  buildDefectiveReworkByOrderMilestone,
} = require('../../utils/outsourceDispatchMatrix.js');
const { buildOutOfSequenceTemplateIds } = require('../../utils/reportVariantMaxQty.js');
const {
  activateMatrixKeyboardCell,
  applyMatrixKeyboardKey,
  buildMatrixKeyboardPreview,
  createMatrixKeyboardInputSession,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');
const { fetchPartnersAll, fetchPartnerCategoriesAll, fetchDictionaries } = require('../../utils/planApi.js');
const { fetchTenantConfig, createProductionRecordBatch } = require('../../utils/orderApi.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');
const { fetchAllOrdersPaginated } = require('../../utils/pendingStockBadge.js');
const { readNavBarMetrics, readWindowMetrics, computeSimplePlanHeaderHeight, computeFixedFooterInsetPx } = require('../../utils/windowMetrics.js');
const { afterMatrixKeyboardOpen } = require('../../utils/matrixKeyboardLayout.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = computeSimplePlanHeaderHeight(nav);
  const footerPx = computeFixedFooterInsetPx(128);
  return Math.max(200, win.windowHeight - headerPx - footerPx);
}

Page({
  data: {
    partners: [],
    partnerCategories: [],
    partnerName: '',
    showDeliveryDate: false,
    deliveryDate: '',
    lines: [],
    submitting: false,
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    activeMatrixRowKey: '',
    activeMatrixVariantId: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 400,
    matrixScrollTop: 0,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission((ctx && ctx.permissions) || [], 'production:outsource_send:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const detail = (getApp().globalData && getApp().globalData.outsourceDispatchConfirm) || null;
    if (!detail || !detail.rows || !detail.rows.length) {
      wx.showToast({ title: '缺少发出数据', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._detail = detail;
    this._quantities = {};
    this._matrixKbInput = createMatrixKeyboardInputSession();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeSimplePlanHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
    this.init();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  buildMatrixCtx() {
    const detail = this._detail || {};
    const nodes = detail.nodes || [];
    return {
      productionLinkMode: this._productionLinkMode,
      orders: this._orders || [],
      products: this._products || [],
      categories: this._categories || [],
      records: detail.records || [],
      productMilestoneProgresses: detail.productMilestoneProgresses || [],
      processSequenceMode: this._processSequenceMode,
      outOfSequenceTemplateIds: buildOutOfSequenceTemplateIds(nodes),
      defectiveReworkMap: this._defectiveReworkMap,
    };
  },

  rebuildLines() {
    const ctx = this.buildMatrixCtx();
    const lines = (this._detail.rows || []).map((row) => {
      const rowKey = dispatchRowKey(row);
      const matrixCtx = resolveDispatchRowMatrixContext(row, ctx);
      const maxMap = buildDispatchVariantMaxMap(row, ctx, this._quantities);
      const line = {
        rowKey,
        titleLine: row.orderNumber ? `${row.orderNumber} · ${row.productName}` : row.productName,
        milestoneName: row.milestoneName,
        maxQty: row.availableQty,
        quantity: this._quantities[rowKey] != null ? String(this._quantities[rowKey]) : '',
        hasMatrix: matrixCtx.hasMatrix,
      };
      if (matrixCtx.hasMatrix) {
        const product = ctx.products.find((p) => p.id === row.productId);
        line.matrixLayout = buildOutsourceDispatchMatrixLayout(
          product,
          this._dictionaries,
          this._quantities,
          maxMap,
          rowKey,
        );
        line.matrixAggregate = matrixCtx.aggregate;
      }
      return line;
    });
    const patch = { lines };
    if (this.data.matrixKeyboardVisible && this.data.activeMatrixRowKey && this.data.activeMatrixVariantId) {
      const line = lines.find((l) => l.rowKey === this.data.activeMatrixRowKey);
      const preview = buildMatrixKeyboardPreview(
        line?.matrixLayout,
        this.data.activeMatrixVariantId,
        this._quantitiesForVariant(this.data.activeMatrixRowKey),
      );
      patch.matrixKeyboardLabel = preview.label;
      patch.matrixKeyboardValue = preview.value;
    }
    this.setData(patch);
  },

  async init() {
    try {
      const detail = this._detail;
      const [config, partnersRaw, partnerCategoriesRaw, orders, dictionariesRaw] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll().catch(() => []),
        detail.orders && detail.orders.length
          ? Promise.resolve(detail.orders)
          : fetchAllOrdersPaginated({}),
        fetchDictionaries().catch(() => ({})),
      ]);
      this._config = config;
      this._orders = orders || [];
      this._ordersById = new Map(this._orders.map((o) => [o.id, o]));
      this._products = detail.products || [];
      this._categories = detail.categories || [];
      this._dictionaries = dictionariesRaw || { colors: [], sizes: [], units: [] };
      this._productionLinkMode = detail.productionLinkMode || config.productionLinkMode || 'order';
      this._processSequenceMode = detail.processSequenceMode || config.processSequenceMode || 'sequential';
      this._defectiveReworkMap = buildDefectiveReworkByOrderMilestone(
        this._orders,
        detail.records || [],
      );

      const ctx = this.buildMatrixCtx();
      this._quantities = buildDefaultDispatchQuantities(detail.rows || [], ctx);

      const partners = normalizeMasterList(partnersRaw).filter((p) => p.name);
      const partnerCategories = normalizeMasterList(partnerCategoriesRaw);
      this._partners = partners;

      this.rebuildLines();
      this.setData({
        partners,
        partnerCategories,
        partnerName: '',
        showDeliveryDate: (config.outsourceFormSettings || {}).showOutsourceDispatchDeliveryDate === true,
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '初始化失败', icon: 'none' });
    }
  },

  onPartnerChange(e) {
    const name = (e.detail && e.detail.name) ? String(e.detail.name) : '';
    this.setData({ partnerName: name });
  },

  onDeliveryDateChange(e) {
    this.setData({ deliveryDate: e.detail.value || '' });
  },

  onQtyInput(e) {
    const key = e.currentTarget.dataset.key;
    this._quantities[key] = e.detail.value || '';
    this.rebuildLines();
  },

  onMatrixCellTap(e) {
    const { rowKey, variantId } = e.currentTarget.dataset;
    if (!rowKey || !variantId) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const line = (this.data.lines || []).find((l) => l.rowKey === rowKey);
    const preview = buildMatrixKeyboardPreview(line?.matrixLayout, variantId, this._quantitiesForVariant(rowKey));
    const nav = { statusBarHeight: this.data.statusBarHeight, navBarHeight: this.data.navBarHeight };
    const win = readWindowMetrics();
    const fullScroll = Math.max(200, win.windowHeight - computeSimplePlanHeaderHeight(nav));
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixRowKey: rowKey,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
      scrollHeight: fullScroll,
    }, () => {
      afterMatrixKeyboardOpen(this, '.outsource-confirm-scroll');
    });
  },

  _quantitiesForVariant(rowKey) {
    const map = {};
    Object.keys(this._quantities || {}).forEach((k) => {
      if (!k.startsWith(`${rowKey}|`)) return;
      map[k.slice(rowKey.length + 1)] = this._quantities[k];
    });
    return map;
  },

  _dismissMatrixKeyboard() {
    const nav = { statusBarHeight: this.data.statusBarHeight, navBarHeight: this.data.navBarHeight };
    this.setData({
      matrixKeyboardVisible: false,
      matrixInputReplaceAll: false,
      activeMatrixRowKey: '',
      activeMatrixVariantId: '',
      matrixKeyboardLabel: '',
      matrixKeyboardValue: '',
      scrollHeight: computeScrollHeight(nav),
    });
  },

  _clampActiveMatrixCell() {
    const { activeMatrixRowKey, activeMatrixVariantId } = this.data;
    if (!activeMatrixRowKey || !activeMatrixVariantId) return;
    const row = (this._detail.rows || []).find((r) => dispatchRowKey(r) === activeMatrixRowKey);
    const line = (this.data.lines || []).find((l) => l.rowKey === activeMatrixRowKey);
    if (!row || !line) return;
    const ctx = this.buildMatrixCtx();
    const maxMap = buildDispatchVariantMaxMap(row, ctx, this._quantities);
    const maxAllowed = computeOutsourceCellMaxAllowed(
      maxMap[activeMatrixVariantId],
      activeMatrixVariantId,
      activeMatrixRowKey,
      this._quantities,
      row.availableQty,
      line.matrixAggregate,
    );
    const key = variantQuantityKey(activeMatrixRowKey, activeMatrixVariantId);
    const qty = Number(this._quantities[key]) || 0;
    if (qty > maxAllowed) {
      this._quantities[key] = maxAllowed > 0 ? String(maxAllowed) : '';
      wx.showToast({ title: `最多 ${maxAllowed}`, icon: 'none' });
      this.rebuildLines();
    }
  },

  _moveMatrixFocus(nextVariantId) {
    const { activeMatrixRowKey } = this.data;
    if (!activeMatrixRowKey) {
      this._dismissMatrixKeyboard();
      return;
    }
    if (!nextVariantId) {
      this._dismissMatrixKeyboard();
      return;
    }
    activateMatrixKeyboardCell(this._matrixKbInput);
    const line = (this.data.lines || []).find((l) => l.rowKey === activeMatrixRowKey);
    const preview = buildMatrixKeyboardPreview(
      line?.matrixLayout,
      nextVariantId,
      this._quantitiesForVariant(activeMatrixRowKey),
    );
    this.setData({
      activeMatrixVariantId: nextVariantId,
      matrixInputReplaceAll: true,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    }, () => {
      afterMatrixKeyboardOpen(this, '.outsource-confirm-scroll');
    });
  },

  onMatrixKeyboardAction(e) {
    const { action, digit } = e.detail || {};
    if (action === 'confirm') {
      this._clampActiveMatrixCell();
      this._dismissMatrixKeyboard();
      return;
    }
    const { activeMatrixRowKey, activeMatrixVariantId } = this.data;
    const line = (this.data.lines || []).find((l) => l.rowKey === activeMatrixRowKey);
    if (action === 'enter') {
      this._clampActiveMatrixCell();
      this._moveMatrixFocus(getNextMatrixVariantIdInRow(line?.matrixLayout, activeMatrixVariantId));
      return;
    }
    if (action === 'next') {
      this._clampActiveMatrixCell();
      this._moveMatrixFocus(getNextMatrixVariantIdInColumn(line?.matrixLayout, activeMatrixVariantId));
      return;
    }
    if (!activeMatrixRowKey || !activeMatrixVariantId) return;
    const key = variantQuantityKey(activeMatrixRowKey, activeMatrixVariantId);
    const variantQtyMap = this._quantitiesForVariant(activeMatrixRowKey);
    const current = variantQtyMap[activeMatrixVariantId] || '';
    const { value, replaceConsumed } = applyMatrixKeyboardKey(this._matrixKbInput, current, action, digit);
    this._quantities[key] = value;
    if (replaceConsumed) {
      this.setData({ matrixInputReplaceAll: false });
    }
    this.rebuildLines();
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const partnerName = String(this.data.partnerName || '').trim();
    if (!partnerName) {
      wx.showToast({ title: '请选择合作单位', icon: 'none' });
      return;
    }
    const quantities = {};
    let hasQty = false;
    Object.keys(this._quantities).forEach((k) => {
      const q = Number(this._quantities[k]);
      if (Number.isFinite(q) && q > 0) {
        quantities[k] = q;
        hasQty = true;
      }
    });
    if (!hasQty) {
      wx.showToast({ title: '请填写数量', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      const batch = buildDispatchBatchPayload({
        rows: this._detail.rows,
        quantities,
        partnerName,
        operator: readOperatorDisplayName(readTenantCtx()),
        productionLinkMode: this._productionLinkMode,
        ordersById: this._ordersById,
        deliveryDate: this.data.deliveryDate,
      });
      if (!batch.length) {
        throw new Error('无有效发出行');
      }
      const resp = await createProductionRecordBatch(batch);
      const saved = (resp && resp.records) || [];
      if (!saved.length) {
        throw new Error('提交成功但未返回记录');
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.OUTSOURCE_DISPATCH,
        toastTitle: '发出成功',
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      // eslint-disable-next-line no-console
      console.error('[outsource-dispatch-confirm]', err);
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    }
  },
});
