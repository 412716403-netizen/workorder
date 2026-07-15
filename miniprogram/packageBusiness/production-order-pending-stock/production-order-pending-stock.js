const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../utils/pendingStockBadge.js'),loadPendingStockRows = _require3.loadPendingStockRows;
const _require4 = require('../../utils/orderApi.js'),fetchTenantConfig = _require4.fetchTenantConfig,fetchProductsAll = _require4.fetchProductsAll,fetchCategoriesAll = _require4.fetchCategoriesAll;
const _require5 = require('../../utils/productionPlans.js'),normalizeMasterList = _require5.normalizeMasterList;
const _require6 = require('../../utils/orderReportHistory.js'),productMetaFromMap = _require6.productMetaFromMap;
const _require7 = require('../../utils/listProductThumb.js'),DEFAULT_PRODUCT_PLACEHOLDER_ICON = _require7.DEFAULT_PRODUCT_PLACEHOLDER_ICON;
const _require8 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require8.readNavBarMetrics,readWindowMetrics = _require8.readWindowMetrics;
const _require9 = require('../utils/scanBatchController.js'),createScanBatchController = _require9.createScanBatchController;
const _require0 = require('../utils/scanBatchApplyPendingStock.js'),createPendingStockScanBatchHandlers = _require0.createPendingStockScanBatchHandlers;
const _require10 = require('../../utils/featurePlugins.js'),loadTraceabilityScanEnabled = _require10.loadTraceabilityScanEnabled;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil(win.windowWidth / 750 * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function mapListRow(row, productionLinkMode, productMap) {
  const isProductMode = productionLinkMode === 'product';
  const meta = productMetaFromMap(productMap, row.productId, row.productName, '');
  return {
    rowKey: row.rowKey,
    orderId: row.orderId,
    productId: row.productId || '',
    titleLine: isProductMode ? meta.name || row.productName || row.orderNumber : row.orderNumber || '',
    subtitleLine: isProductMode ?
    `涉及 ${row.productBlockOrderTotal || row.orderTotal} 件工单总量` :
    meta.name || row.productName || '',
    productName: meta.name || row.productName || '',
    productSku: meta.sku,
    showProductSku: meta.showSku,
    showTitleSku: isProductMode && meta.showSku,
    showSubtitleSku: !isProductMode && meta.showSku,
    productImageUrl: meta.imageUrl,
    showProductImage: Boolean(meta.imageUrl),
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    orderTotal: row.orderTotal,
    alreadyIn: row.alreadyIn,
    pendingTotal: row.pendingTotal,
    selected: false
  };
}

Page({
  data: {
    loading: true,
    rows: [],
    selectedCount: 0,
    canCreate: false,
    canViewFlow: false,
    scanEnabled: false,
    productionLinkMode: 'order',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad(options) {
    if (options.orderId) {
      wx.redirectTo({
        url: `/packageBusiness/production-order-stock-in-confirm/production-order-stock-in-confirm?mode=single&rowKeys=${encodeURIComponent(options.orderId)}`
      });
      return;
    }
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    const perms = ctx && ctx.permissions || [];
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canCreate: hasPermission(perms, 'production:orders_pending_stock_in:create'),
      canViewFlow: hasPermission(perms, 'production:orders_pending_stock_in:view')
    });
    const pendingScan = createPendingStockScanBatchHandlers(this);
    this._scanBatch = createScanBatchController(this, {
      title: '待入库 · 批量扫码',
      showScanIntentToggle: true,
      resolveRowPreview: (payload) => pendingScan.resolveRowPreview(payload),
      onConfirm: (payloads) => pendingScan.onConfirm(payloads)
    });
    this.loadList();
    loadTraceabilityScanEnabled().then((scanEnabled) => {
      this.setData({ scanEnabled });
    });
  },

  onShow() {
    if (!this.data.loading) this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onGoFlow() {
    wx.navigateTo({ url: '/packageBusiness/production-order-stock-in-history/production-order-stock-in-history' });
  },

  onGoScan() {
    if (this._scanBatch) this._scanBatch.open();
  },

  onScanBatchClose() {
    if (this._scanBatch) this._scanBatch.close();
  },

  onScanBatchScan() {
    if (this._scanBatch) this._scanBatch.triggerScan();
  },

  onScanBatchConfirm() {
    if (this._scanBatch) this._scanBatch.confirm();
  },

  onScanBatchRemove(e) {
    if (this._scanBatch) this._scanBatch.removeRow(e.detail.id);
  },

  onScanBatchIntentChange(e) {
    if (this._scanBatch) this._scanBatch.setScanIntent(e.detail.intent);
  },

  onProductImageError(e) {
    const rowKey = e.currentTarget.dataset.rowKey;
    if (!rowKey) return;
    const patch = (row) => row.rowKey === rowKey ? { ...row, showProductImage: false } : row;
    this.setData({ rows: (this.data.rows || []).map(patch) });
  },

  onSelectInbound(e) {
    const rowKey = e.currentTarget.dataset.rowKey;
    if (!rowKey) return;
    this.openConfirm([rowKey]);
  },

  onListRowTap(e) {
    const rowKey = e.currentTarget.dataset.rowKey;
    if (!rowKey) return;
    this.openConfirm([rowKey]);
  },

  onToggleSelect(e) {
    const rowKey = e.currentTarget.dataset.rowKey;
    if (!rowKey) return;
    const rows = (this.data.rows || []).map((row) => {
      if (row.rowKey !== rowKey) return row;
      return { ...row, selected: !row.selected };
    });
    this.setData({
      rows,
      selectedCount: rows.filter((r) => r.selected).length
    });
  },

  onBatchInbound() {
    const keys = (this.data.rows || []).filter((r) => r.selected).map((r) => r.rowKey);
    if (!keys.length) {
      wx.showToast({ title: '请先勾选待入库项', icon: 'none' });
      return;
    }
    this.openConfirm(keys);
  },

  openConfirm(rowKeys) {
    const encoded = rowKeys.map((k) => encodeURIComponent(k)).join(',');
    const mode = rowKeys.length > 1 ? 'batch' : 'single';
    wx.navigateTo({
      url: `/packageBusiness/production-order-stock-in-confirm/production-order-stock-in-confirm?mode=${mode}&rowKeys=${encoded}`
    });
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchTenantConfig(),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        loadPendingStockRows()]
        ),config = _await$Promise$all[0],productsRaw = _await$Promise$all[1],categoriesRaw = _await$Promise$all[2],rawRows = _await$Promise$all[3];
      const productionLinkMode = config && config.productionLinkMode || 'order';
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      this._productMap = productMap;
      this._categoryMap = new Map(categories.map((c) => [c.id, c]));
      this._allowExceedMaxStockInQty = !!(config && config.allowExceedMaxStockInQty);
      this._rawRows = rawRows;
      const rows = rawRows.map((row) => mapListRow(row, productionLinkMode, productMap));
      this.setData({
        loading: false,
        rows,
        selectedCount: 0,
        productionLinkMode
      });
    } catch {
      this.setData({ loading: false, rows: [], selectedCount: 0 });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});