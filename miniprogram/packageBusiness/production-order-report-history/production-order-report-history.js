const _require = require('../utils/orderApi.js'),listReportHistory = _require.listReportHistory,fetchTenantConfig = _require.fetchTenantConfig,fetchProductsAll = _require.fetchProductsAll,fetchNodesAll = _require.fetchNodesAll;
const _require2 = require('../utils/productionPlans.js'),normalizeMasterList = _require2.normalizeMasterList;
const _require3 =





  require('../utils/orderReportHistory.js'),defaultDateRange = _require3.defaultDateRange,dateInputToIsoStart = _require3.dateInputToIsoStart,dateInputToIsoEndExclusive = _require3.dateInputToIsoEndExclusive,localTodayYmd = _require3.localTodayYmd,filterReportHistoryRows = _require3.filterReportHistoryRows;
const _require4 =



  require('../utils/reportBatchDetail.js'),buildReportBatches = _require4.buildReportBatches,mapBatchToListRow = _require4.mapBatchToListRow,computeReportHistoryStatsFromBatches = _require4.computeReportHistoryStatsFromBatches;
const _require5 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require5.readNavBarMetrics,readWindowMetrics = _require5.readWindowMetrics;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    rows: [],
    dateFrom: '',
    dateTo: '',
    searchKeyword: '',
    searchPlaceholder: '工单号 / 产品 / 报工单号 / 操作人',
    showFilterPanel: false,
    isGlobalMode: false,
    milestoneOptions: [{ id: '', name: '全部工序' }],
    milestoneFilterIndex: 0,
    milestoneTemplateId: '',
    milestoneFilterLabel: '全部工序',
    emptyText: '暂无报工记录',
    stats: { batchCount: 0, goodTotal: 0, defectiveTotal: 0 },
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._orderId = options.orderId ? decodeURIComponent(options.orderId) : '';
    this._isGlobalMode = !this._orderId;

    const today = localTodayYmd();
    const range = defaultDateRange();
    const dateFrom = options.dateFrom ?
    decodeURIComponent(options.dateFrom) :
    this._isGlobalMode ? today : range.start;
    const dateTo = options.dateTo ?
    decodeURIComponent(options.dateTo) :
    this._isGlobalMode ? today : range.end;

    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      dateFrom,
      dateTo,
      isGlobalMode: this._isGlobalMode,
      searchPlaceholder: this._isGlobalMode ?
      '工单号 / 产品 / 报工单号 / 操作人' :
      '产品 / 报工单号 / 操作人'
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
      this.closeFilterPanel();
      return;
    }
    this.setData({ showFilterPanel: true });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.setData({ showFilterPanel: false });
  },

  onPageScroll() {
    this.closeFilterPanel();
  },

  onFilterReset() {
    const today = localTodayYmd();
    this.setData({
      dateFrom: today,
      dateTo: today,
      milestoneFilterIndex: 0,
      milestoneTemplateId: '',
      milestoneFilterLabel: '全部工序',
      showFilterPanel: false
    }, () => this.loadRows());
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

  onShow() {
    if (this._needReload || this._refreshOnNextShow) {
      this._needReload = false;
      this._refreshOnNextShow = false;
      this.loadRows();
    }
  },

  onRowTap(e) {
    this.closeFilterPanel();
    const batchKey = e.currentTarget.dataset.batchKey;
    if (!batchKey) return;
    this._needReload = true;
    const q = [
    `batchKey=${encodeURIComponent(batchKey)}`,
    `dateFrom=${encodeURIComponent(this.data.dateFrom || '')}`,
    `dateTo=${encodeURIComponent(this.data.dateTo || '')}`];

    if (this._orderId) q.push(`orderId=${encodeURIComponent(this._orderId)}`);
    wx.navigateTo({
      url: `/packageBusiness/production-order-report-batch-detail/production-order-report-batch-detail?${q.join('&')}`
    });
  },

  onProductImageError(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const rows = (this.data.rows || []).map((row) =>
    row.id === id ? { ...row, showProductImage: false } : row
    );
    this.setData({ rows });
  },

  onMilestoneFilterChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = (this.data.milestoneOptions || [])[idx] || { id: '', name: '全部工序' };
    this.setData({
      milestoneFilterIndex: idx,
      milestoneTemplateId: opt.id || '',
      milestoneFilterLabel: opt.name || '全部工序'
    });
    this.applyClientFilters();
  },

  applyClientFilters() {
    const filtered = filterReportHistoryRows(this._listRows || [], this.data.searchKeyword, {
      milestoneTemplateId: this.data.milestoneTemplateId
    });
    this.setData({
      rows: filtered,
      stats: computeReportHistoryStatsFromBatches(this._filteredBatches(filtered)),
      emptyText: '所选日期内暂无报工'
    });
  },

  _filteredBatches(filteredRows) {
    const keys = new Set((filteredRows || []).map((row) => row.batchKey));
    return (this._batches || []).filter((b) => keys.has(b.key));
  },

  async loadRows() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchTenantConfig(),
        fetchProductsAll().catch(() => []),
        fetchNodesAll().catch(() => [])]
        ),config = _await$Promise$all[0],productsRaw = _await$Promise$all[1],nodesRaw = _await$Promise$all[2];
      const productionLinkMode = config && config.productionLinkMode || 'order';
      this._productionLinkMode = productionLinkMode;

      const products = normalizeMasterList(productsRaw);
      const nodes = normalizeMasterList(nodesRaw);
      this._productMap = new Map(products.map((p) => [p.id, p]));

      const milestoneOptions = [{ id: '', name: '全部工序' }].concat(
        nodes.map((n) => ({ id: n.id, name: n.name || n.id }))
      );
      let milestoneFilterIndex = this.data.milestoneFilterIndex || 0;
      if (milestoneFilterIndex >= milestoneOptions.length) milestoneFilterIndex = 0;
      const milestoneOpt = milestoneOptions[milestoneFilterIndex] || milestoneOptions[0];

      const params = {
        startDate: dateInputToIsoStart(this.data.dateFrom),
        endDate: dateInputToIsoEndExclusive(this.data.dateTo),
        productionLinkMode
      };
      if (this._orderId) params.orderIds = this._orderId;

      const res = await listReportHistory(params);
      const orderReports = res && res.orderReports || [];
      const productReports = res && res.productReports || [];

      const mapCtx = {
        isGlobalMode: this._isGlobalMode,
        productionLinkMode,
        productMap: this._productMap
      };

      this._batches = buildReportBatches(orderReports, productReports, productionLinkMode);
      this._listRows = this._batches.map((batch) => mapBatchToListRow(batch, mapCtx));
      this.setData({
        milestoneOptions,
        milestoneFilterIndex,
        milestoneTemplateId: milestoneOpt.id || '',
        milestoneFilterLabel: milestoneOpt.name || '全部工序'
      });
      this.applyClientFilters();
      this.setData({ loading: false });
    } catch (err) {
      this.setData({
        loading: false,
        rows: [],
        stats: { batchCount: 0, goodTotal: 0, defectiveTotal: 0 }
      });
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
    }
  }
});