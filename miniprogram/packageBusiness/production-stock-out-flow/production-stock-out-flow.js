const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  fetchProductionRecords,
  fetchTenantConfig,
  fetchProductsAll,
  fetchWarehousesAll,
} = require('../utils/orderApi.js');
const { normalizeMasterList } = require('../utils/productionPlans.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const {
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
  localTodayYmd,
} = require('../utils/orderReportHistory.js');
const { fetchDictionaries } = require('../utils/planApi.js');
const {
  buildMaterialFlowListRows,
  filterMaterialFlowRows,
  computeMaterialFlowStats,
  TYPE_FILTER_LABELS,
  TYPE_FILTER_VALUES,
} = require('../utils/materialStockFlow.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
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
    headerBlockHeight: 88,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission((ctx && ctx.permissions) || [], 'production:material_records:view')) {
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
      draftDateTo: today,
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
      filterActive: computeFilterActive({ ...this.data, ...extra }, today),
    });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    this.setData({
      draftDateFrom: this.data.dateFrom,
      draftDateTo: this.data.dateTo,
      draftTypeIndex: this.data.typeFilterIndex,
    });
    this.patchFilterActive({ showFilterPanel: true });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.patchFilterActive({ showFilterPanel: false });
  },

  onPageScroll() {
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
      showFilterPanel: false,
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
    const { batchKey } = e.currentTarget.dataset;
    if (!batchKey) return;
    const row = (this._allRows || []).find((r) => r.batchKey === batchKey);
    if (!row || !row.docNo) return;
    wx.navigateTo({
      url: `/packageBusiness/production-stock-out-detail/production-stock-out-detail?docNo=${encodeURIComponent(row.docNo)}`,
    });
  },

  applyFilter() {
    const filtered = filterMaterialFlowRows(this._allRows || [], {
      keyword: this.data.searchKeyword,
      typeFilter: this.data.typeFilter,
    });
    this.setData({
      rows: filtered,
      stats: computeMaterialFlowStats(filtered),
    });
  },

  async loadRows() {
    this.setData({ loading: true });
    try {
      const [config, orders, productsRaw, warehousesRaw, dictionariesRaw] = await Promise.all([
        fetchTenantConfig(),
        fetchAllOrdersPaginated({}),
        fetchProductsAll().catch(() => []),
        fetchWarehousesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
      ]);
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const orderMap = new Map((orders || []).map((o) => [o.id, o]));
      const products = normalizeMasterList(productsRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const warehouses = Array.isArray(warehousesRaw) ? warehousesRaw : (warehousesRaw.data || []);
      const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

      const records = await fetchProductionRecords({
        types: 'STOCK_OUT,STOCK_RETURN',
        all: 'true',
        startDate: dateInputToIsoStart(this.data.dateFrom),
        endDate: dateInputToIsoEndExclusive(this.data.dateTo),
      });
      const list = Array.isArray(records) ? records : (records.data || []);
      const allRows = buildMaterialFlowListRows(list, {
        productionLinkMode,
        orderMap,
        productMap,
        warehouseMap,
        dictionaries: dictionariesRaw || {},
      });
      this._allRows = allRows;
      this.applyFilter();

      const today = this._today || localTodayYmd();
      this.setData({
        loading: false,
        filterActive: computeFilterActive(this.data, today),
      });
    } catch {
      this._allRows = [];
      this.setData({
        loading: false,
        rows: [],
        stats: { batchCount: 0, footerText: '共 0 条' },
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
