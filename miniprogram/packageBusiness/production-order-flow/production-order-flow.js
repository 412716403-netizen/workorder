const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../utils/planFilterPanel.js');
const { ORDER_DISPATCH_STATUS_LABEL, OrderDispatchStatus } = require('../config/productionOrders.js');
const { fetchTenantConfig, fetchProductsAll } = require('../utils/orderApi.js');
const { normalizeMasterList, productNameSkuParts } = require('../utils/productionPlans.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const {
  localTodayYmd,
  filterOrdersForFlow,
  computeFlowStats,
  mapFlowRow,
} = require('../utils/orderFlow.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function dispatchMeta(order) {
  const status = order.dispatchStatus || OrderDispatchStatus.IN_PROGRESS;
  const label = ORDER_DISPATCH_STATUS_LABEL[status] || status;
  const pillClass = status === OrderDispatchStatus.COMPLETED
    ? 'st-pill--success'
    : 'st-pill--primary';
  return { dispatchLabel: label, dispatchPillClass: pillClass };
}

Page({
  data: {
    loading: true,
    rows: [],
    dateFrom: '',
    dateTo: '',
    searchKeyword: '',
    showFilterPanel: false,
    emptyText: '所选条件下暂无工单',
    stats: { count: 0, totalQty: 0 },
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const today = localTodayYmd();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      dateFrom: today,
      dateTo: today,
    });
    this._allOrders = [];
    this.bootstrap();
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    markFilterPanelOpen(this);
    this.setData({ showFilterPanel: true });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.setData({ showFilterPanel: false });
  },

  onPageScroll() {
    if (!shouldCloseFilterPanelOnScroll(this)) return;
    this.closeFilterPanel();
  },

  onFilterReset() {
    const today = localTodayYmd();
    this.setData({
      dateFrom: today,
      dateTo: today,
      showFilterPanel: false,
    });
    this.applyFilters();
  },

  onFilterApply() {
    this.setData({ showFilterPanel: false });
    this.applyFilters();
  },

  onDateFromChange(e) {
    this.setData({ dateFrom: e.detail.value || '' });
    this.applyFilters();
  },

  onDateToChange(e) {
    this.setData({ dateTo: e.detail.value || '' });
    this.applyFilters();
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    clearTimeout(this._filterTimer);
    this._filterTimer = setTimeout(() => this.applyFilters(), 300);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyFilters();
  },

  onRowTap(e) {
    this.closeFilterPanel();
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: `/packageBusiness/production-order-detail/production-order-detail?id=${encodeURIComponent(id)}`,
    });
  },

  onProductImageError(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    const rows = (this.data.rows || []).map((row) =>
      row.id === id ? { ...row, showProductImage: false } : row,
    );
    this.setData({ rows });
  },

  productMetaForOrder(order) {
    const product = (this._productMap || new Map()).get(order.productId);
    if (!product) {
      return {
        name: order.productName || '',
        sku: order.sku || '',
        showSku: Boolean(order.sku),
        imageUrl: '',
      };
    }
    const display = productNameSkuParts(product);
    return {
      name: display.name,
      sku: display.sku,
      showSku: display.showSku,
      imageUrl: (product.imageThumb || product.imageUrl) || '',
    };
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const config = await fetchTenantConfig();
      const planFormSettings = (config && config.planFormSettings) || {};
      const planListDisplay = planFormSettings.listDisplay || {};
      this._productionLinkMode = (config && config.productionLinkMode) || 'order';
      this._showDueDate = planListDisplay.showDeliveryDate !== false;
      this._showDispatch = this._productionLinkMode !== 'product';

      try {
        const productsRaw = await fetchProductsAll();
        const products = normalizeMasterList(productsRaw);
        this._productMap = new Map(products.map((p) => [p.id, p]));
      } catch {
        this._productMap = new Map();
      }

      this._allOrders = await fetchAllOrdersPaginated({});
      this.applyFilters();
    } catch {
      this.setData({ loading: false, rows: [], stats: { count: 0, totalQty: 0 } });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  applyFilters() {
    const kw = (this.data.searchKeyword || '').trim().toLowerCase();
    const filtered = filterOrdersForFlow(this._allOrders || [], {
      dateFrom: this.data.dateFrom,
      dateTo: this.data.dateTo,
      orderNumberKeyword: kw,
      productNameKeyword: kw,
    });
    const stats = computeFlowStats(filtered);
    const rows = filtered.map((order) => {
      const meta = dispatchMeta(order);
      const product = this.productMetaForOrder(order);
      return mapFlowRow(order, {
        showDispatch: this._showDispatch,
        showDueDate: this._showDueDate,
        dispatchLabel: meta.dispatchLabel,
        dispatchPillClass: meta.dispatchPillClass,
        productName: product.name,
        productSku: product.sku,
        showProductSku: product.showSku,
        productImageUrl: product.imageUrl,
        showProductImage: Boolean(product.imageUrl),
      });
    });
    this.setData({
      loading: false,
      rows,
      stats,
      emptyText: '所选条件下暂无工单',
    });
  },
});
