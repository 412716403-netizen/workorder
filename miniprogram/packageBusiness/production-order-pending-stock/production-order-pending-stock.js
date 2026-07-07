const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadPendingStockRows } = require('../utils/pendingStockBadge.js');
const { fetchTenantConfig, fetchProductsAll } = require('../utils/orderApi.js');
const { normalizeMasterList } = require('../utils/productionPlans.js');
const { productMetaFromMap } = require('../utils/orderReportHistory.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON } = require('../utils/listProductThumb.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function mapListRow(row, productionLinkMode, productMap) {
  const isProductMode = productionLinkMode === 'product';
  const meta = productMetaFromMap(productMap, row.productId, row.productName, '');
  return {
    rowKey: row.rowKey,
    orderId: row.orderId,
    productId: row.productId || '',
    titleLine: isProductMode ? (meta.name || row.productName || row.orderNumber) : (row.orderNumber || ''),
    subtitleLine: isProductMode
      ? `涉及 ${row.productBlockOrderTotal || row.orderTotal} 件工单总量`
      : (meta.name || row.productName || ''),
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
    selected: false,
  };
}

Page({
  data: {
    loading: true,
    rows: [],
    selectedCount: 0,
    canCreate: false,
    canViewFlow: false,
    productionLinkMode: 'order',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    if (options.orderId) {
      wx.redirectTo({
        url: `/packageBusiness/production-order-stock-in-confirm/production-order-stock-in-confirm?mode=single&rowKeys=${encodeURIComponent(options.orderId)}`,
      });
      return;
    }
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    const perms = (ctx && ctx.permissions) || [];
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canCreate: hasPermission(perms, 'production:orders_pending_stock_in:create'),
      canViewFlow: hasPermission(perms, 'production:orders_pending_stock_in:view'),
    });
    this.loadList();
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
    const app = getApp();
    if (app.globalData) {
      app.globalData.scanPreset = { type: 'stockIn', fromPendingStock: true };
    }
    wx.switchTab({ url: '/pages/scan/scan' });
  },

  onProductImageError(e) {
    const { rowKey } = e.currentTarget.dataset;
    if (!rowKey) return;
    const patch = (row) => (row.rowKey === rowKey ? { ...row, showProductImage: false } : row);
    this.setData({ rows: (this.data.rows || []).map(patch) });
  },

  onSelectInbound(e) {
    const { rowKey } = e.currentTarget.dataset;
    if (!rowKey) return;
    this.openConfirm([rowKey]);
  },

  onListRowTap(e) {
    const { rowKey } = e.currentTarget.dataset;
    if (!rowKey) return;
    this.openConfirm([rowKey]);
  },

  onToggleSelect(e) {
    const { rowKey } = e.currentTarget.dataset;
    if (!rowKey) return;
    const rows = (this.data.rows || []).map((row) => {
      if (row.rowKey !== rowKey) return row;
      return { ...row, selected: !row.selected };
    });
    this.setData({
      rows,
      selectedCount: rows.filter((r) => r.selected).length,
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
      url: `/packageBusiness/production-order-stock-in-confirm/production-order-stock-in-confirm?mode=${mode}&rowKeys=${encoded}`,
    });
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const [config, productsRaw, rawRows] = await Promise.all([
        fetchTenantConfig(),
        fetchProductsAll().catch(() => []),
        loadPendingStockRows(),
      ]);
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const products = normalizeMasterList(productsRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      this._rawRows = rawRows;
      const rows = rawRows.map((row) => mapListRow(row, productionLinkMode, productMap));
      this.setData({
        loading: false,
        rows,
        selectedCount: 0,
        productionLinkMode,
      });
    } catch {
      this.setData({ loading: false, rows: [], selectedCount: 0 });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
