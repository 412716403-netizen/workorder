const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =




  require('../utils/reworkReportFlow.js'),buildReworkReportFlowSummaryRows = _require3.buildReworkReportFlowSummaryRows,buildReportFlowMilestoneOptions = _require3.buildReportFlowMilestoneOptions,filterReworkReportFlowRows = _require3.filterReworkReportFlowRows,computeReworkReportFlowStats = _require3.computeReworkReportFlowStats;
const _require4 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require4.fetchAllOrdersPaginated;
const _require5 =




  require('../utils/orderApi.js'),fetchTenantConfig = _require5.fetchTenantConfig,fetchProductsAll = _require5.fetchProductsAll,fetchNodesAll = _require5.fetchNodesAll,fetchProductionRecords = _require5.fetchProductionRecords;
const _require6 =



  require('../utils/orderReportHistory.js'),localTodayYmd = _require6.localTodayYmd,dateInputToIsoStart = _require6.dateInputToIsoStart,dateInputToIsoEndExclusive = _require6.dateInputToIsoEndExclusive;
const _require7 = require('../utils/productionPlans.js'),normalizeMasterList = _require7.normalizeMasterList;
const _require8 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require8.readNavBarMetrics,readWindowMetrics = _require8.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../../utils/planFilterPanel.js');
const _require9 = require('../utils/reworkReportOperator.js'),buildReworkByIdMap = _require9.buildReworkByIdMap;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function computeFilterActive(data, today) {
  if (data.showFilterPanel) return true;
  if (data.milestoneNodeId) return true;
  if (data.dateFrom && data.dateFrom !== today) return true;
  if (data.dateTo && data.dateTo !== today) return true;
  return false;
}

function milestoneOptionAt(options, index) {
  const list = options || [{ id: '', name: '全部工序' }];
  return list[index] || list[0] || { id: '', name: '全部工序' };
}

Page({
  data: {
    loading: true,
    rows: [],
    dateFrom: '',
    dateTo: '',
    draftDateFrom: '',
    draftDateTo: '',
    searchKeyword: '',
    showFilterPanel: false,
    filterActive: false,
    milestoneOptions: [{ id: '', name: '全部工序' }],
    milestoneNodeId: '',
    milestoneFilterIndex: 0,
    milestoneFilterLabel: '全部工序',
    draftMilestoneFilterIndex: 0,
    draftMilestoneFilterLabel: '全部工序',
    stats: { footerText: '共 0 条' },
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission(ctx && ctx.permissions || [], 'production:rework_report_records:view')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const today = localTodayYmd();
    this._today = today;
    this._flowSeed = {
      orderKeyword: options.orderKeyword ? decodeURIComponent(options.orderKeyword) : '',
      productKeyword: options.productKeyword ? decodeURIComponent(options.productKeyword) : '',
      milestoneNodeId: options.milestoneNodeId ? decodeURIComponent(options.milestoneNodeId) : ''
    };
    if (this._flowSeed.orderKeyword || this._flowSeed.productKeyword) {
      this._flowSeedActive = true;
    }
    if (this._flowSeed.milestoneNodeId) {
      this._pendingMilestoneNodeId = this._flowSeed.milestoneNodeId;
    }
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      dateFrom: today,
      dateTo: today,
      draftDateFrom: today,
      draftDateTo: today,
      searchKeyword: this._flowSeed.orderKeyword || this._flowSeed.productKeyword || ''
    });
    this.loadRows();
  },

  onShow() {
    if (this._refreshOnNextShow) {
      this._refreshOnNextShow = false;
      this.loadRows();
      return;
    }
    if (this._loadedOnce && !this._bootstrapping) {
      this.loadRows();
    }
  },

  onPullDownRefresh() {
    this.loadRows().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  patchFilterActive(extra) {
    const today = this._today || localTodayYmd();
    this.setData({
      ...extra,
      filterActive: computeFilterActive({ ...this.data, ...extra }, today)
    });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.patchFilterActive({ showFilterPanel: false });
      return;
    }
    markFilterPanelOpen(this);
    this.patchFilterActive({
      showFilterPanel: true,
      draftDateFrom: this.data.dateFrom,
      draftDateTo: this.data.dateTo,
      draftMilestoneFilterIndex: this.data.milestoneFilterIndex,
      draftMilestoneFilterLabel: this.data.milestoneFilterLabel
    });
  },

  onPageScroll() {
    if (!shouldCloseFilterPanelOnScroll(this)) return;
    if (this.data.showFilterPanel) {
      this.patchFilterActive({ showFilterPanel: false });
    }
  },

  onFilterReset() {
    const today = localTodayYmd();
    this._today = today;
    this._flowSeedActive = false;
    this.patchFilterActive({
      dateFrom: today,
      dateTo: today,
      draftDateFrom: today,
      draftDateTo: today,
      milestoneNodeId: '',
      milestoneFilterIndex: 0,
      milestoneFilterLabel: '全部工序',
      draftMilestoneFilterIndex: 0,
      draftMilestoneFilterLabel: '全部工序',
      showFilterPanel: false,
      searchKeyword: ''
    });
    this.loadRows();
  },

  onFilterApply() {
    const milestoneIdx = Number(this.data.draftMilestoneFilterIndex) || 0;
    const milestoneOpt = milestoneOptionAt(this.data.milestoneOptions, milestoneIdx);
    const dateFrom = this.data.draftDateFrom || this.data.dateFrom;
    const dateTo = this.data.draftDateTo || this.data.dateTo;
    const datesChanged = dateFrom !== this.data.dateFrom || dateTo !== this.data.dateTo;
    this._flowSeedActive = false;
    this.patchFilterActive({
      dateFrom,
      dateTo,
      milestoneNodeId: milestoneOpt.id || '',
      milestoneFilterIndex: milestoneIdx,
      milestoneFilterLabel: milestoneOpt.name || '全部工序',
      showFilterPanel: false
    });
    if (datesChanged) {
      this.loadRows();
      return;
    }
    this.applyFilter();
  },

  onDraftDateFromChange(e) {
    this.setData({ draftDateFrom: e.detail.value || '' });
  },

  onDraftDateToChange(e) {
    this.setData({ draftDateTo: e.detail.value || '' });
  },

  onDraftMilestoneChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = milestoneOptionAt(this.data.milestoneOptions, idx);
    this.setData({
      draftMilestoneFilterIndex: idx,
      draftMilestoneFilterLabel: opt.name || '全部工序'
    });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    clearTimeout(this._filterTimer);
    this._filterTimer = setTimeout(() => this.applyFilter(), 300);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyFilter();
  },

  onProductImageError(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const rows = (this.data.rows || []).map((row) =>
    row.batchKey === key ? { ...row, showProductImage: false } : row
    );
    this.setData({ rows });
  },

  onRowTap(e) {
    const batchKey = e.currentTarget.dataset.batchKey;
    const row = (this._allRows || []).find((r) => r.batchKey === batchKey);
    if (!row || !row.docNo) return;
    wx.navigateTo({
      url: `/packageBusiness/production-rework-report-flow-detail/production-rework-report-flow-detail?docNo=${encodeURIComponent(row.docNo)}`
    });
  },

  applyFilter() {
    const filtered = filterReworkReportFlowRows(this._allRows || [], {
      searchKeyword: this.data.searchKeyword,
      milestoneNodeId: this.data.milestoneNodeId,
      reworkById: this._reworkById,
      ...(this._flowSeedActive ? this._flowSeed : {})
    });
    this.setData({
      rows: filtered,
      stats: computeReworkReportFlowStats(filtered)
    });
  },

  syncMilestoneOptions(nodesById) {
    const milestoneOptions = buildReportFlowMilestoneOptions(this._allRows || [], nodesById);
    let milestoneFilterIndex = this.data.milestoneFilterIndex || 0;
    const pendingId = this._pendingMilestoneNodeId || '';
    if (pendingId) {
      const idx = milestoneOptions.findIndex((o) => o.id === pendingId);
      if (idx >= 0) milestoneFilterIndex = idx;
      this._pendingMilestoneNodeId = '';
    } else if (milestoneFilterIndex >= milestoneOptions.length) {
      milestoneFilterIndex = 0;
    }
    const milestoneOpt = milestoneOptionAt(milestoneOptions, milestoneFilterIndex);
    this.patchFilterActive({
      milestoneOptions,
      milestoneFilterIndex,
      milestoneNodeId: milestoneOpt.id || '',
      milestoneFilterLabel: milestoneOpt.name || '全部工序'
    });
  },

  async loadRows() {
    this._bootstrapping = true;
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchTenantConfig(),
        fetchAllOrdersPaginated({}),
        fetchProductsAll().catch(() => []),
        fetchNodesAll().catch(() => [])]
        ),config = _await$Promise$all[0],orders = _await$Promise$all[1],productsRaw = _await$Promise$all[2],nodesRaw = _await$Promise$all[3];
      const productionLinkMode = config && config.productionLinkMode || 'order';
      const ordersById = new Map((orders || []).map((o) => [o.id, o]));
      const productsById = new Map(normalizeMasterList(productsRaw).map((p) => [p.id, p]));
      const nodesById = new Map(normalizeMasterList(nodesRaw).map((n) => [n.id, n]));

      const from = this.data.dateFrom;
      const to = this.data.dateTo;
      const params = {
        types: 'REWORK_REPORT,REWORK',
        all: 'true'
      };
      if (from) params.startDate = dateInputToIsoStart(from);
      if (to) params.endDate = dateInputToIsoEndExclusive(to);

      const recordsRaw = await fetchProductionRecords(params);
      this._allRecords = recordsRaw || [];
      this._reworkById = buildReworkByIdMap(this._allRecords);
      this._allRows = buildReworkReportFlowSummaryRows(this._allRecords, {
        productionLinkMode,
        ordersById,
        productsById,
        nodesById,
        reworkById: this._reworkById
      });
      this.syncMilestoneOptions(nodesById);
      this.setData({ loading: false });
      this.applyFilter();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
    } finally {
      this._bootstrapping = false;
      this._loadedOnce = true;
    }
  }
});