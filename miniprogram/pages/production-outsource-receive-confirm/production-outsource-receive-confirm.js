const { readOperatorDisplayName, readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { outsourceReceiveBaseKey } = require('../../utils/outsourceReceiveKeys.js');
const {
  buildReceiveBatchPayload,
} = require('../../utils/outsourceConfirm.js');
const {
  receiveVariantQuantityKey,
  resolveReceiveRowMatrixContext,
  buildReceiveVariantMaxMap,
  computeReceiveCellMaxAllowed,
  buildOutsourceReceiveMatrixLayout,
  collectReceiveQuantityEntries,
  validateReceiveQuantities,
} = require('../../utils/outsourceReceiveMatrix.js');
const { parsePositiveInt } = require('../../utils/orderReportForm.js');
const { getProductUnitName } = require('../../utils/planFormCustomField.js');
const { fetchDictionaries } = require('../../utils/planApi.js');
const {
  fetchTenantConfig,
  createProductionRecordBatch,
} = require('../../utils/orderApi.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');
const { listProductThumbFromProduct } = require('../../utils/listProductThumb.js');
const { fetchAllOrdersPaginated } = require('../../utils/pendingStockBadge.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
  computeFixedFooterInsetPx,
} = require('../../utils/windowMetrics.js');
const { afterMatrixKeyboardOpen } = require('../../utils/matrixKeyboardLayout.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');
const {
  activateMatrixKeyboardCell,
  applyMatrixKeyboardKey,
  buildMatrixKeyboardPreview,
  createMatrixKeyboardInputSession,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = computePlanCreateHeaderHeight(nav);
  const footerPx = computeFixedFooterInsetPx(128);
  return Math.max(200, win.windowHeight - headerPx - footerPx);
}

function sumLineQuantities(rowKey, isProductScope, quantities) {
  const { RECEIVE_VARIANT_SEP } = require('../../utils/outsourceReceiveKeys.js');
  let sum = 0;
  Object.keys(quantities || {}).forEach((k) => {
    const q = Number(quantities[k]) || 0;
    if (q <= 0) return;
    if (k === rowKey) {
      sum += q;
      return;
    }
    if (isProductScope) {
      if (k.startsWith(`${rowKey}${RECEIVE_VARIANT_SEP}`)) sum += q;
      return;
    }
    if (k.startsWith(`${rowKey}|`)) sum += q;
  });
  return sum;
}

function formatAmountText(totalQty, unitPrice) {
  if (!(totalQty > 0) || !(unitPrice > 0)) return '';
  const amount = Math.round(totalQty * unitPrice * 100) / 100;
  return `${amount} 元`;
}

Page({
  data: {
    loading: true,
    lines: [],
    submitting: false,
    canViewAmount: false,
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
    if (!hasPermission((ctx && ctx.permissions) || [], 'production:outsource_receive:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const detail = (getApp().globalData && getApp().globalData.outsourceReceiveConfirm) || null;
    if (!detail || !detail.rows || !detail.rows.length) {
      wx.showToast({ title: '缺少收回数据', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._detail = detail;
    this._quantities = {};
    this._unitPrices = {};
    this._matrixKbInput = createMatrixKeyboardInputSession();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      canViewAmount: hasPermission((ctx && ctx.permissions) || [], 'production:outsource_amount:allow'),
    });
    this.init();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  buildMatrixCtx() {
    const detail = this._detail || {};
    return {
      productionLinkMode: this._productionLinkMode,
      orders: this._orders || [],
      products: this._products || [],
      categories: this._categories || [],
      records: detail.records || [],
      productMilestoneProgresses: detail.productMilestoneProgresses || [],
    };
  },

  rebuildLines() {
    const ctx = this.buildMatrixCtx();
    const allowExceed = this._allowExceed === true;
    const canViewAmount = this.data.canViewAmount;
    const lines = (this._detail.rows || []).map((row) => {
      const rowKey = outsourceReceiveBaseKey(row);
      const product = (ctx.products || []).find((p) => p.id === row.productId);
      const unitName = getProductUnitName(product, this._dictionaries);
      const matrixCtx = resolveReceiveRowMatrixContext(row, ctx);
      const maxMap = buildReceiveVariantMaxMap(row, ctx, this._quantities);
      const milestoneName = row.milestoneName || '—';
      const partnerLabel = (row.partner || '').trim() || '—';
      const pending = Math.max(0, Number(row.pending) || 0);
      const dispatched = Math.max(0, Number(row.dispatched) || 0);
      const received = Math.max(0, Number(row.received) || 0);
      const totalQty = sumLineQuantities(rowKey, matrixCtx.isProductScope, this._quantities);
      const unitPrice = Number(this._unitPrices[rowKey]) || 0;
      const amountText = formatAmountText(totalQty, unitPrice);
      const thumb = listProductThumbFromProduct(product);

      const line = {
        rowKey,
        ...thumb,
        showOrderNumber: Boolean(row.orderNumber),
        orderNumber: row.orderNumber || '',
        productName: row.productName || '—',
        milestoneName,
        partnerLabel,
        pendingMeta: `待收 ${pending} ${unitName}`,
        statsMeta: (dispatched > 0 || received > 0)
          ? `已派 ${dispatched} ${unitName} · 已收 ${received} ${unitName}`
          : '',
        pending,
        quantity: this._quantities[rowKey] != null ? String(this._quantities[rowKey]) : '',
        unitPrice: this._unitPrices[rowKey] != null ? String(this._unitPrices[rowKey]) : '',
        totalReceiveText: `${totalQty} ${unitName}`,
        amountText,
        showAmount: canViewAmount && Boolean(amountText),
        maxQtyLabel: allowExceed ? '' : (pending > 0 ? `最多 ${pending} ${unitName}` : ''),
        maxQtyHint: allowExceed ? '' : (pending > 0 ? `最多可收 ${pending} ${unitName}` : ''),
        hasMatrix: matrixCtx.hasMatrix,
        isProductScope: matrixCtx.isProductScope,
      };
      if (matrixCtx.hasMatrix) {
        line.matrixLayout = buildOutsourceReceiveMatrixLayout(
          matrixCtx.product || product,
          this._dictionaries,
          this._quantities,
          maxMap,
          matrixCtx.baseKey,
          matrixCtx.isProductScope,
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
        this._quantitiesForVariant(this.data.activeMatrixRowKey, line?.isProductScope),
      );
      patch.matrixKeyboardLabel = preview.label;
      patch.matrixKeyboardValue = preview.value;
    }
    this.setData(patch);
  },

  async init() {
    try {
      const detail = this._detail;
      const [config, orders, dictionariesRaw] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        detail.orders && detail.orders.length
          ? Promise.resolve(detail.orders)
          : fetchAllOrdersPaginated({}),
        fetchDictionaries().catch(() => ({})),
      ]);
      this._allowExceed = config.allowExceedMaxOutsourceReceiveQty === true;
      this._productionLinkMode = detail.productionLinkMode || config.productionLinkMode || 'order';
      this._orders = orders || [];
      this._ordersById = new Map(this._orders.map((o) => [o.id, o]));
      this._products = detail.products || [];
      this._categories = detail.categories || [];
      this._dictionaries = dictionariesRaw || { colors: [], sizes: [], units: [] };

      this.rebuildLines();
      this.setData({ loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '初始化失败', icon: 'none' });
    }
  },

  onProductImageError(e) {
    const { key } = e.currentTarget.dataset;
    if (!key) return;
    const lines = (this.data.lines || []).map((line) => (
      line.rowKey === key ? { ...line, showProductImage: false } : line
    ));
    this.setData({ lines });
  },

  onQtyInput(e) {
    const key = e.currentTarget.dataset.key;
    this._quantities[key] = e.detail.value || '';
    this.rebuildLines();
  },

  onQtyStep(e) {
    const key = e.currentTarget.dataset.key;
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const line = (this.data.lines || []).find((l) => l.rowKey === key);
    const allowExceed = this._allowExceed === true;
    const maxQty = Math.max(0, Number(line && line.pending) || 0);
    let next = parsePositiveInt(this._quantities[key], 1) + delta;
    if (next < 0) next = 0;
    if (!allowExceed && maxQty > 0 && next > maxQty) next = maxQty;
    this._quantities[key] = String(next);
    this.rebuildLines();
  },

  onPriceInput(e) {
    const key = e.currentTarget.dataset.key;
    this._unitPrices[key] = e.detail.value || '';
    this.rebuildLines();
  },

  _quantitiesForVariant(rowKey, isProductScope) {
    const map = {};
    const { RECEIVE_VARIANT_SEP } = require('../../utils/outsourceReceiveKeys.js');
    Object.keys(this._quantities || {}).forEach((k) => {
      if (isProductScope) {
        if (!k.startsWith(`${rowKey}${RECEIVE_VARIANT_SEP}`)) return;
        map[k.slice(rowKey.length + RECEIVE_VARIANT_SEP.length)] = this._quantities[k];
        return;
      }
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
    const row = (this._detail.rows || []).find((r) => outsourceReceiveBaseKey(r) === activeMatrixRowKey);
    const line = (this.data.lines || []).find((l) => l.rowKey === activeMatrixRowKey);
    if (!row || !line) return;
    const ctx = this.buildMatrixCtx();
    const maxMap = buildReceiveVariantMaxMap(row, ctx, this._quantities);
    const maxAllowed = this._allowExceed
      ? Infinity
      : computeReceiveCellMaxAllowed(
        maxMap[activeMatrixVariantId],
        activeMatrixVariantId,
        activeMatrixRowKey,
        this._quantities,
        row.pending,
        line.matrixAggregate,
        line.isProductScope,
      );
    const key = receiveVariantQuantityKey(activeMatrixRowKey, activeMatrixVariantId, line.isProductScope);
    const qty = Number(this._quantities[key]) || 0;
    if (!this._allowExceed && qty > maxAllowed) {
      this._quantities[key] = maxAllowed > 0 ? String(maxAllowed) : '';
      wx.showToast({ title: `最多 ${maxAllowed}`, icon: 'none' });
      this.rebuildLines();
    }
  },

  _moveMatrixFocus(nextVariantId) {
    const { activeMatrixRowKey } = this.data;
    if (!activeMatrixRowKey || !nextVariantId) {
      this._dismissMatrixKeyboard();
      return;
    }
    const line = (this.data.lines || []).find((l) => l.rowKey === activeMatrixRowKey);
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      line?.matrixLayout,
      nextVariantId,
      this._quantitiesForVariant(activeMatrixRowKey, line?.isProductScope),
    );
    this.setData({
      activeMatrixVariantId: nextVariantId,
      matrixInputReplaceAll: true,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    }, () => {
      afterMatrixKeyboardOpen(this, '.plan-detail-scroll');
    });
  },

  onMatrixCellTap(e) {
    const { rowKey, variantId } = e.currentTarget.dataset;
    if (!rowKey || !variantId) return;
    const line = (this.data.lines || []).find((l) => l.rowKey === rowKey);
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      line?.matrixLayout,
      variantId,
      this._quantitiesForVariant(rowKey, line?.isProductScope),
    );
    const nav = { statusBarHeight: this.data.statusBarHeight, navBarHeight: this.data.navBarHeight };
    const win = readWindowMetrics();
    const fullScroll = Math.max(200, win.windowHeight - computePlanCreateHeaderHeight(nav));
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixRowKey: rowKey,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
      scrollHeight: fullScroll,
    }, () => {
      afterMatrixKeyboardOpen(this, '.plan-detail-scroll');
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
    const key = receiveVariantQuantityKey(
      activeMatrixRowKey,
      activeMatrixVariantId,
      line?.isProductScope,
    );
    const variantQtyMap = this._quantitiesForVariant(activeMatrixRowKey, line?.isProductScope);
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
    const quantities = {};
    const unitPrices = {};
    Object.keys(this._quantities || {}).forEach((k) => {
      const q = Number(this._quantities[k]);
      if (Number.isFinite(q) && q > 0) quantities[k] = q;
    });
    Object.keys(this._unitPrices || {}).forEach((k) => {
      const p = Number(this._unitPrices[k]);
      if (Number.isFinite(p) && p > 0) unitPrices[k] = p;
    });

    const err = validateReceiveQuantities(
      this._detail.rows,
      quantities,
      this._detail.records || [],
      this._allowExceed === true,
      this.buildMatrixCtx(),
    );
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    if (!collectReceiveQuantityEntries(this._detail.rows, quantities).length) {
      wx.showToast({ title: '请填写收回数量', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      const batch = buildReceiveBatchPayload({
        rows: this._detail.rows,
        quantities,
        unitPrices,
        operator: readOperatorDisplayName(readTenantCtx()),
        ordersById: this._ordersById,
      });
      if (!batch.length) {
        throw new Error('无有效收回行');
      }
      const resp = await createProductionRecordBatch(batch);
      const saved = (resp && resp.records) || [];
      if (!saved.length) {
        throw new Error('提交成功但未返回记录');
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.OUTSOURCE_RECEIVE,
        toastTitle: '收回成功',
      });
    } catch (submitErr) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: (submitErr && submitErr.message) || '提交失败', icon: 'none' });
    }
  },
});
