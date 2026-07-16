const _require = require('../../utils/session.js'),readOperatorDisplayName = _require.readOperatorDisplayName,readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../utils/outsourceDispatchLite.js'),dispatchRowKey = _require3.dispatchRowKey;
const _require4 =

  require('../utils/outsourceConfirm.js'),buildDispatchBatchPayload = _require4.buildDispatchBatchPayload;
const _require5 =







  require('../utils/outsourceDispatchMatrix.js'),buildDefaultDispatchQuantities = _require5.buildDefaultDispatchQuantities,buildDispatchVariantMaxMap = _require5.buildDispatchVariantMaxMap,buildOutsourceDispatchMatrixLayout = _require5.buildOutsourceDispatchMatrixLayout,computeOutsourceCellMaxAllowed = _require5.computeOutsourceCellMaxAllowed,resolveDispatchRowMatrixContext = _require5.resolveDispatchRowMatrixContext,variantQuantityKey = _require5.variantQuantityKey,buildDefectiveReworkByOrderMilestone = _require5.buildDefectiveReworkByOrderMilestone;
const _require6 = require('../utils/reportVariantMaxQty.js'),buildOutOfSequenceTemplateIds = _require6.buildOutOfSequenceTemplateIds;
const _require7 =






  require('../../utils/matrixQtyKeyboard.js'),activateMatrixKeyboardCell = _require7.activateMatrixKeyboardCell,applyMatrixKeyboardKey = _require7.applyMatrixKeyboardKey,buildMatrixKeyboardPreview = _require7.buildMatrixKeyboardPreview,createMatrixKeyboardInputSession = _require7.createMatrixKeyboardInputSession,getNextMatrixVariantIdInColumn = _require7.getNextMatrixVariantIdInColumn,getNextMatrixVariantIdInRow = _require7.getNextMatrixVariantIdInRow;
const _require8 = require('../../utils/planApi.js'),fetchPartnersAll = _require8.fetchPartnersAll,fetchPartnerCategoriesAll = _require8.fetchPartnerCategoriesAll,fetchDictionaries = _require8.fetchDictionaries;
const _require9 = require('../../utils/orderApi.js'),fetchTenantConfig = _require9.fetchTenantConfig,createProductionRecordBatch = _require9.createProductionRecordBatch;
const _require0 = require('../../utils/productionPlans.js'),normalizeMasterList = _require0.normalizeMasterList;
const _require1 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require1.fetchAllOrdersPaginated;
const _require10 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require10.readNavBarMetrics,readWindowMetrics = _require10.readWindowMetrics,computeSimplePlanHeaderHeight = _require10.computeSimplePlanHeaderHeight,computeFixedFooterInsetPx = _require10.computeFixedFooterInsetPx;
const _require11 = require('../../utils/matrixKeyboardLayout.js'),afterMatrixKeyboardOpen = _require11.afterMatrixKeyboardOpen,handleMatrixOutsideTap = _require11.handleMatrixOutsideTap;
const _require12 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require12.LIST_ROUTES,afterSaveReturnToList = _require12.afterSaveReturnToList;
const { applyPartnerCreatedOnPage } = require('../../utils/mergePartnerList.js');
const { defaultEntryDate, defaultEntryTimeHm, entryDateAndTimeToIso } = require('../../utils/docEntryTime.js');

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
    entryDate: '',
    entryTime: '',
    pickerSheetOpen: false,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission(ctx && ctx.permissions || [], 'production:outsource_send:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const detail = getApp().globalData && getApp().globalData.outsourceDispatchConfirm || null;
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
      entryDate: defaultEntryDate(),
      entryTime: defaultEntryTimeHm()
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
      defectiveReworkMap: this._defectiveReworkMap
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
        hasMatrix: matrixCtx.hasMatrix
      };
      if (matrixCtx.hasMatrix) {
        const product = ctx.products.find((p) => p.id === row.productId);
        line.matrixLayout = buildOutsourceDispatchMatrixLayout(
          product,
          this._dictionaries,
          this._quantities,
          maxMap,
          rowKey
        );
        line.matrixAggregate = matrixCtx.aggregate;
      }
      return line;
    });
    const patch = { lines };
    if (this.data.matrixKeyboardVisible && this.data.activeMatrixRowKey && this.data.activeMatrixVariantId) {
      const line = lines.find((l) => l.rowKey === this.data.activeMatrixRowKey);
      const preview = buildMatrixKeyboardPreview(
      line == null ? void 0 : line.matrixLayout,
      this.data.activeMatrixVariantId,
      this._quantitiesForVariant(this.data.activeMatrixRowKey)
      );
      patch.matrixKeyboardLabel = preview.label;
      patch.matrixKeyboardValue = preview.value;
    }
    this.setData(patch);
  },

  async init() {
    try {
      const detail = this._detail;
      const _await$Promise$all = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll().catch(() => []),
        detail.orders && detail.orders.length ?
        Promise.resolve(detail.orders) :
        fetchAllOrdersPaginated({}),
        fetchDictionaries().catch(() => ({}))]
        ),config = _await$Promise$all[0],partnersRaw = _await$Promise$all[1],partnerCategoriesRaw = _await$Promise$all[2],orders = _await$Promise$all[3],dictionariesRaw = _await$Promise$all[4];
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
        detail.records || []
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
        showDeliveryDate: (config.outsourceFormSettings || {}).showOutsourceDispatchDeliveryDate === true
      });
    } catch (err) {
      wx.showToast({ title: err && err.message || '初始化失败', icon: 'none' });
    }
  },

  onPartnerChange(e) {
    const name = e.detail && e.detail.name ? String(e.detail.name) : '';
    this.setData({ partnerName: name });
  },

  onPartnerCreated(e) {
    applyPartnerCreatedOnPage(this, e, { cacheKey: '_partners' });
  },

  onEntryDateTimeChange(e) {
    const detail = e.detail || {};
    this.setData({
      entryDate: detail.date || '',
      entryTime: detail.time || '',
    });
  },

  onPickerSheetOpen() {
    this.setData({ pickerSheetOpen: true });
  },

  onPickerSheetClose() {
    this.setData({ pickerSheetOpen: false });
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
    const _e$currentTarget$data = e.currentTarget.dataset,rowKey = _e$currentTarget$data.rowKey,variantId = _e$currentTarget$data.variantId;
    if (!rowKey || !variantId) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const line = (this.data.lines || []).find((l) => l.rowKey === rowKey);
    const preview = buildMatrixKeyboardPreview(line == null ? void 0 : line.matrixLayout, variantId, this._quantitiesForVariant(rowKey));
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
      scrollHeight: fullScroll
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
      scrollHeight: computeScrollHeight(nav)
    });
  },

  _clampActiveMatrixCell() {
    const _this$data = this.data,activeMatrixRowKey = _this$data.activeMatrixRowKey,activeMatrixVariantId = _this$data.activeMatrixVariantId;
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
      line.matrixAggregate
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
    const activeMatrixRowKey = this.data.activeMatrixRowKey;
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
    line == null ? void 0 : line.matrixLayout,
    nextVariantId,
    this._quantitiesForVariant(activeMatrixRowKey)
    );
    this.setData({
      activeMatrixVariantId: nextVariantId,
      matrixInputReplaceAll: true,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    }, () => {
      afterMatrixKeyboardOpen(this, '.outsource-confirm-scroll');
    });
  },

  onMatrixOutsideTap() {
    handleMatrixOutsideTap(this);
  },


  onMatrixKeyboardAction(e) {
    const _ref = e.detail || {},action = _ref.action,digit = _ref.digit;
    if (action === 'confirm') {
      this._clampActiveMatrixCell();
      this._dismissMatrixKeyboard();
      return;
    }
    const _this$data2 = this.data,activeMatrixRowKey = _this$data2.activeMatrixRowKey,activeMatrixVariantId = _this$data2.activeMatrixVariantId;
    const line = (this.data.lines || []).find((l) => l.rowKey === activeMatrixRowKey);
    if (action === 'enter') {
      this._clampActiveMatrixCell();
      this._moveMatrixFocus(getNextMatrixVariantIdInRow(line == null ? void 0 : line.matrixLayout, activeMatrixVariantId));
      return;
    }
    if (action === 'next') {
      this._clampActiveMatrixCell();
      this._moveMatrixFocus(getNextMatrixVariantIdInColumn(line == null ? void 0 : line.matrixLayout, activeMatrixVariantId));
      return;
    }
    if (!activeMatrixRowKey || !activeMatrixVariantId) return;
    const key = variantQuantityKey(activeMatrixRowKey, activeMatrixVariantId);
    const variantQtyMap = this._quantitiesForVariant(activeMatrixRowKey);
    const current = variantQtyMap[activeMatrixVariantId] || '';
    const _applyMatrixKeyboardK = applyMatrixKeyboardKey(this._matrixKbInput, current, action, digit),value = _applyMatrixKeyboardK.value,replaceConsumed = _applyMatrixKeyboardK.replaceConsumed;
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
        timestamp: entryDateAndTimeToIso(this.data.entryDate, this.data.entryTime)
      });
      if (!batch.length) {
        throw new Error('无有效发出行');
      }
      const resp = await createProductionRecordBatch(batch);
      const saved = resp && resp.records || [];
      if (!saved.length) {
        throw new Error('提交成功但未返回记录');
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.OUTSOURCE_HUB,
        toastTitle: '发出成功'
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      // eslint-disable-next-line no-console
      console.error('[outsource-dispatch-confirm]', err);
      wx.showToast({ title: err && err.message || '提交失败', icon: 'none' });
    }
  }
});