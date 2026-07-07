const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  TYPE_FILTER_LABELS,
  TYPE_FILTER_VALUES,
  buildOutsourceFlowSummaryRows,
  buildFlowMilestoneOptions,
  filterOutsourceFlowRows,
  computeOutsourceFlowStats,
} = require('../utils/outsourceFlow.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const {
  fetchTenantConfig,
  fetchProductsAll,
  fetchNodesAll,
  fetchProductionRecords,
} = require('../utils/orderApi.js');
const {
  localTodayYmd,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
} = require('../utils/orderReportHistory.js');
const { normalizeMasterList } = require('../utils/productionPlans.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function computeFilterActive(data, today) {
  if (data.showFilterPanel) return true;
  if (data.typeFilter) return true;
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
    typeFilter: '',
    typeFilterLabels: TYPE_FILTER_LABELS,
    draftTypeIndex: 0,
    typeFilterIndex: 0,
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
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission((ctx && ctx.permissions) || [], 'production:outsource_records:view')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const today = localTodayYmd();
    this._today = today;
    this._flowSeed = {
      orderKeyword: options.orderKeyword ? decodeURIComponent(options.orderKeyword) : '',
      productKeyword: options.productKeyword ? decodeURIComponent(options.productKeyword) : '',
      partnerKeyword: options.partnerKeyword ? decodeURIComponent(options.partnerKeyword) : '',
      milestoneNodeId: options.milestoneNodeId ? decodeURIComponent(options.milestoneNodeId) : '',
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
      searchKeyword: this._flowSeed.orderKeyword || this._flowSeed.productKeyword || '',
    });
    this.loadRows();
  },

  onShow() {
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
      filterActive: computeFilterActive({ ...this.data, ...extra }, today),
    });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.patchFilterActive({ showFilterPanel: false });
      return;
    }
    this.patchFilterActive({
      showFilterPanel: true,
      draftDateFrom: this.data.dateFrom,
      draftDateTo: this.data.dateTo,
      draftTypeIndex: this.data.typeFilterIndex,
      draftMilestoneFilterIndex: this.data.milestoneFilterIndex,
      draftMilestoneFilterLabel: this.data.milestoneFilterLabel,
    });
  },

  onPageScroll() {
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
      typeFilter: '',
      typeFilterIndex: 0,
      draftTypeIndex: 0,
      milestoneNodeId: '',
      milestoneFilterIndex: 0,
      milestoneFilterLabel: '全部工序',
      draftMilestoneFilterIndex: 0,
      draftMilestoneFilterLabel: '全部工序',
      showFilterPanel: false,
      searchKeyword: '',
    });
    this.loadRows();
  },

  onFilterApply() {
    const typeIdx = Number(this.data.draftTypeIndex) || 0;
    const typeFilter = TYPE_FILTER_VALUES[typeIdx] || '';
    const milestoneIdx = Number(this.data.draftMilestoneFilterIndex) || 0;
    const milestoneOpt = milestoneOptionAt(this.data.milestoneOptions, milestoneIdx);
    const dateFrom = this.data.draftDateFrom || this.data.dateFrom;
    const dateTo = this.data.draftDateTo || this.data.dateTo;
    const datesChanged = dateFrom !== this.data.dateFrom || dateTo !== this.data.dateTo;
    this._flowSeedActive = false;
    this.patchFilterActive({
      dateFrom,
      dateTo,
      typeFilter,
      typeFilterIndex: typeIdx,
      milestoneNodeId: milestoneOpt.id || '',
      milestoneFilterIndex: milestoneIdx,
      milestoneFilterLabel: milestoneOpt.name || '全部工序',
      showFilterPanel: false,
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

  onDraftTypeChange(e) {
    this.setData({ draftTypeIndex: Number(e.detail.value) || 0 });
  },

  onDraftMilestoneChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = milestoneOptionAt(this.data.milestoneOptions, idx);
    this.setData({
      draftMilestoneFilterIndex: idx,
      draftMilestoneFilterLabel: opt.name || '全部工序',
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
    const { key } = e.currentTarget.dataset;
    if (!key) return;
    const rows = (this.data.rows || []).map((row) =>
      row.batchKey === key ? { ...row, showProductImage: false } : row,
    );
    this.setData({ rows });
  },

  onRowTap(e) {
    const { batchKey } = e.currentTarget.dataset;
    const row = (this._allRows || []).find((r) => r.batchKey === batchKey);
    if (!row || !row.docNo) return;
    wx.navigateTo({
      url: `/packageBusiness/production-outsource-flow-detail/production-outsource-flow-detail?docNo=${encodeURIComponent(row.docNo)}`,
    });
  },

  applyFilter() {
    const filtered = filterOutsourceFlowRows(this._allRows || [], {
      searchKeyword: this.data.searchKeyword,
      typeFilter: this.data.typeFilter,
      milestoneNodeId: this.data.milestoneNodeId,
      ...(this._flowSeedActive ? this._flowSeed : {}),
    });
    this.setData({
      rows: filtered,
      stats: computeOutsourceFlowStats(filtered),
    });
  },

  syncMilestoneOptions(nodesById) {
    const milestoneOptions = buildFlowMilestoneOptions(this._allRows || [], nodesById);
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
      milestoneFilterLabel: milestoneOpt.name || '全部工序',
    });
  },

  async loadRows() {
    this._bootstrapping = true;
    this.setData({ loading: true });
    try {
      const [config, orders, productsRaw, nodesRaw] = await Promise.all([
        fetchTenantConfig(),
        fetchAllOrdersPaginated({}),
        fetchProductsAll().catch(() => []),
        fetchNodesAll().catch(() => []),
      ]);
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const ordersById = new Map((orders || []).map((o) => [o.id, o]));
      const productsById = new Map(normalizeMasterList(productsRaw).map((p) => [p.id, p]));
      const nodesById = new Map(normalizeMasterList(nodesRaw).map((n) => [n.id, n]));

      const from = this.data.dateFrom;
      const to = this.data.dateTo;
      const params = {
        type: 'OUTSOURCE',
        all: 'true',
      };
      if (from) params.startDate = dateInputToIsoStart(from);
      if (to) params.endDate = dateInputToIsoEndExclusive(to);

      const recordsRaw = await fetchProductionRecords(params);
      this._allRows = buildOutsourceFlowSummaryRows(recordsRaw || [], {
        productionLinkMode,
        ordersById,
        productsById,
        nodesById,
      });
      this.syncMilestoneOptions(nodesById);
      this.setData({ loading: false });
      this.applyFilter();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    } finally {
      this._bootstrapping = false;
      this._loadedOnce = true;
    }
  },
});
