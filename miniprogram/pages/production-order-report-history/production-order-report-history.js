const { listReportHistory, fetchTenantConfig, fetchProductsAll } = require('../../utils/orderApi.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');
const {
  defaultDateRange,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
  localTodayYmd,
  mapOrderReportRow,
  mapProductReportRow,
  filterReportHistoryRows,
  computeReportHistoryStats,
} = require('../../utils/orderReportHistory.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    rows: [],
    dateFrom: '',
    dateTo: '',
    searchKeyword: '',
    searchPlaceholder: '工单号 / 产品',
    showFilterPanel: false,
    isGlobalMode: false,
    emptyText: '暂无报工记录',
    stats: { batchCount: 0, goodTotal: 0, defectiveTotal: 0 },
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._orderId = options.orderId ? decodeURIComponent(options.orderId) : '';
    this._isGlobalMode = !this._orderId;

    const today = localTodayYmd();
    const range = defaultDateRange();
    const dateFrom = options.dateFrom
      ? decodeURIComponent(options.dateFrom)
      : (this._isGlobalMode ? today : range.start);
    const dateTo = options.dateTo
      ? decodeURIComponent(options.dateTo)
      : (this._isGlobalMode ? today : range.end);

    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      dateFrom,
      dateTo,
      isGlobalMode: this._isGlobalMode,
      searchPlaceholder: this._isGlobalMode ? '工单号 / 产品' : '产品 / 工序',
    });

    this.loadRows();
  },

  onPullDownRefresh() {
    this.loadRows().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.setData({ showFilterPanel: false });
      return;
    }
    this.setData({ showFilterPanel: true });
  },

  onFilterReset() {
    const today = localTodayYmd();
    this.setData({
      dateFrom: today,
      dateTo: today,
      showFilterPanel: false,
    });
    this.loadRows();
  },

  onFilterApply() {
    this.setData({ showFilterPanel: false });
  },

  onDateFromChange(e) {
    this.setData({ dateFrom: e.detail.value || '' });
    this.loadRows();
  },

  onDateToChange(e) {
    this.setData({ dateTo: e.detail.value || '' });
    this.loadRows();
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    clearTimeout(this._filterTimer);
    this._filterTimer = setTimeout(() => this.applyClientFilters(), 300);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyClientFilters();
  },

  onRowTap(e) {
    const { orderId } = e.currentTarget.dataset;
    if (!orderId) return;
    wx.navigateTo({
      url: `/pages/production-order-detail/production-order-detail?id=${encodeURIComponent(orderId)}`,
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

  applyClientFilters() {
    const filtered = filterReportHistoryRows(this._rawRows || [], this.data.searchKeyword);
    this.setData({
      rows: filtered,
      stats: computeReportHistoryStats(filtered),
      emptyText: '所选日期内暂无报工',
    });
  },

  async loadRows() {
    this.setData({ loading: true });
    try {
      const [config, productsRaw] = await Promise.all([
        fetchTenantConfig(),
        fetchProductsAll().catch(() => []),
      ]);
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      this._productionLinkMode = productionLinkMode;

      const products = normalizeMasterList(productsRaw);
      this._productMap = new Map(products.map((p) => [p.id, p]));

      const params = {
        startDate: dateInputToIsoStart(this.data.dateFrom),
        endDate: dateInputToIsoEndExclusive(this.data.dateTo),
        productionLinkMode,
      };
      if (this._orderId) params.orderIds = this._orderId;

      const res = await listReportHistory(params);
      const orderReports = (res && res.orderReports) || [];
      const productReports = (res && res.productReports) || [];

      const mapCtx = {
        isGlobalMode: this._isGlobalMode,
        productionLinkMode,
        productMap: this._productMap,
      };

      let mapped = orderReports.map((r, idx) => mapOrderReportRow(r, idx, mapCtx));

      if (productionLinkMode === 'product') {
        const productMapped = productReports.map((r, idx) => mapProductReportRow(r, idx, mapCtx));
        mapped = mapped.concat(productMapped);
      }

      mapped.sort((a, b) => b.timestampMs - a.timestampMs);
      this._rawRows = mapped;
      this.applyClientFilters();
      this.setData({ loading: false });
    } catch (err) {
      this.setData({
        loading: false,
        rows: [],
        stats: { batchCount: 0, goodTotal: 0, defectiveTotal: 0 },
      });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },
});
