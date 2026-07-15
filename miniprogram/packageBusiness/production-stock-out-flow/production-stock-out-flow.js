const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =




  require('../utils/orderApi.js'),fetchProductionRecords = _require3.fetchProductionRecords,fetchTenantConfig = _require3.fetchTenantConfig,fetchProductsAll = _require3.fetchProductsAll,fetchWarehousesAll = _require3.fetchWarehousesAll;
const _require4 = require('../utils/productionPlans.js'),normalizeMasterList = _require4.normalizeMasterList;
const _require5 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require5.fetchAllOrdersPaginated;
const _require6 =



  require('../utils/orderReportHistory.js'),dateInputToIsoStart = _require6.dateInputToIsoStart,dateInputToIsoEndExclusive = _require6.dateInputToIsoEndExclusive,localTodayYmd = _require6.localTodayYmd;
const _require7 = require('../utils/planApi.js'),fetchDictionaries = _require7.fetchDictionaries;
const _require8 =





  require('../utils/materialStockFlow.js'),buildMaterialFlowListRows = _require8.buildMaterialFlowListRows,filterMaterialFlowRows = _require8.filterMaterialFlowRows,computeMaterialFlowStats = _require8.computeMaterialFlowStats,TYPE_FILTER_LABELS = _require8.TYPE_FILTER_LABELS,TYPE_FILTER_VALUES = _require8.TYPE_FILTER_VALUES;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../utils/planFilterPanel.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function computeFilterActive(data, today) {
  if (data.showFilterPanel) return true;
  if (data.typeFilter) return true;
  if (data.dateFrom && data.dateFrom !== today) return true;
  if (data.dateTo && data.dateTo !== today) return true;
  return false;
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
    stats: { batchCount: 0, footerText: '共 0 条' },
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission(ctx && ctx.permissions || [], 'production:material_records:view')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const today = localTodayYmd();
    this._today = today;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      dateFrom: today,
      dateTo: today,
      draftDateFrom: today,
      draftDateTo: today
    });
    this.loadRows();
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
      this.closeFilterPanel();
      return;
    }
    markFilterPanelOpen(this);
    this.setData({
      draftDateFrom: this.data.dateFrom,
      draftDateTo: this.data.dateTo,
      draftTypeIndex: this.data.typeFilterIndex
    });
    this.patchFilterActive({ showFilterPanel: true });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.patchFilterActive({ showFilterPanel: false });
  },

  onPageScroll() {
    if (!shouldCloseFilterPanelOnScroll(this)) return;
    this.closeFilterPanel();
  },

  onFilterReset() {
    const today = localTodayYmd();
    this._today = today;
    this.patchFilterActive({
      dateFrom: today,
      dateTo: today,
      draftDateFrom: today,
      draftDateTo: today,
      typeFilter: '',
      typeFilterIndex: 0,
      draftTypeIndex: 0,
      showFilterPanel: false
    });
    this.loadRows();
  },

  onFilterApply() {
    const typeIdx = Number(this.data.draftTypeIndex) || 0;
    const typeFilter = TYPE_FILTER_VALUES[typeIdx] || '';
    const dateFrom = this.data.draftDateFrom || this.data.dateFrom;
    const dateTo = this.data.draftDateTo || this.data.dateTo;
    const datesChanged = dateFrom !== this.data.dateFrom || dateTo !== this.data.dateTo;

    this.patchFilterActive({
      dateFrom,
      dateTo,
      typeFilter,
      typeFilterIndex: typeIdx,
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

  onDraftTypeChange(e) {
    this.setData({ draftTypeIndex: Number(e.detail.value) || 0 });
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

  onRowTap(e) {
    this.closeFilterPanel();
    const batchKey = e.currentTarget.dataset.batchKey;
    if (!batchKey) return;
    const row = (this._allRows || []).find((r) => r.batchKey === batchKey);
    if (!row || !row.docNo) return;
    wx.navigateTo({
      url: `/packageBusiness/production-stock-out-detail/production-stock-out-detail?docNo=${encodeURIComponent(row.docNo)}`
    });
  },

  applyFilter() {
    const filtered = filterMaterialFlowRows(this._allRows || [], {
      keyword: this.data.searchKeyword,
      typeFilter: this.data.typeFilter
    });
    this.setData({
      rows: filtered,
      stats: computeMaterialFlowStats(filtered)
    });
  },

  async loadRows() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchTenantConfig(),
        fetchAllOrdersPaginated({}),
        fetchProductsAll().catch(() => []),
        fetchWarehousesAll().catch(() => []),
        fetchDictionaries().catch(() => ({}))]
        ),config = _await$Promise$all[0],orders = _await$Promise$all[1],productsRaw = _await$Promise$all[2],warehousesRaw = _await$Promise$all[3],dictionariesRaw = _await$Promise$all[4];
      const productionLinkMode = config && config.productionLinkMode || 'order';
      const orderMap = new Map((orders || []).map((o) => [o.id, o]));
      const products = normalizeMasterList(productsRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const warehouses = Array.isArray(warehousesRaw) ? warehousesRaw : warehousesRaw.data || [];
      const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

      const records = await fetchProductionRecords({
        types: 'STOCK_OUT,STOCK_RETURN',
        all: 'true',
        startDate: dateInputToIsoStart(this.data.dateFrom),
        endDate: dateInputToIsoEndExclusive(this.data.dateTo)
      });
      const list = Array.isArray(records) ? records : records.data || [];
      const allRows = buildMaterialFlowListRows(list, {
        productionLinkMode,
        orderMap,
        productMap,
        warehouseMap,
        dictionaries: dictionariesRaw || {}
      });
      this._allRows = allRows;
      this.applyFilter();

      const today = this._today || localTodayYmd();
      this.setData({
        loading: false,
        filterActive: computeFilterActive(this.data, today)
      });
    } catch {
      this._allRows = [];
      this.setData({
        loading: false,
        rows: [],
        stats: { batchCount: 0, footerText: '共 0 条' }
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});