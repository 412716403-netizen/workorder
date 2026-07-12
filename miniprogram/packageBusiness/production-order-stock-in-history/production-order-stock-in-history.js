const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =




  require('../utils/orderApi.js'),fetchProductionRecords = _require3.fetchProductionRecords,fetchTenantConfig = _require3.fetchTenantConfig,fetchProductsAll = _require3.fetchProductsAll,fetchWarehousesAll = _require3.fetchWarehousesAll;
const _require4 = require('../utils/productionPlans.js'),normalizeMasterList = _require4.normalizeMasterList;
const _require5 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require5.fetchAllOrdersPaginated;
const _require6 =



  require('../utils/orderReportHistory.js'),dateInputToIsoStart = _require6.dateInputToIsoStart,dateInputToIsoEndExclusive = _require6.dateInputToIsoEndExclusive,localTodayYmd = _require6.localTodayYmd;
const _require7 =



  require('../utils/stockInFlow.js'),buildStockInFlowListRows = _require7.buildStockInFlowListRows,filterStockInFlowRows = _require7.filterStockInFlowRows,sumStockInFlowQty = _require7.sumStockInFlowQty;
const _require8 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require8.readNavBarMetrics,readWindowMetrics = _require8.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../../utils/planFilterPanel.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildWarehouseFilterLabels(warehouses) {
  const labels = ['全部仓库'];
  (warehouses || []).forEach((w) => {
    labels.push(w.name || w.code || w.id);
  });
  return labels;
}

function buildWarehouseFilterIds(warehouses) {
  const ids = [''];
  (warehouses || []).forEach((w) => {
    ids.push(w.id);
  });
  return ids;
}

function warehouseIndexForId(ids, warehouseId) {
  const idx = (ids || []).indexOf(warehouseId || '');
  return idx >= 0 ? idx : 0;
}

function computeFilterActive(data, today) {
  if (data.showFilterPanel) return true;
  if (data.filterWarehouseId) return true;
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
    filterWarehouseId: '',
    filterWarehouseIndex: 0,
    draftWarehouseIndex: 0,
    warehouseFilterLabels: ['全部仓库'],
    showFilterPanel: false,
    filterActive: false,
    stats: { batchCount: 0, totalQty: 0 },
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission(ctx && ctx.permissions || [], 'production:orders_pending_stock_in:view')) {
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

  syncFilterDraftFromApplied() {
    this.setData({
      draftDateFrom: this.data.dateFrom,
      draftDateTo: this.data.dateTo,
      draftWarehouseIndex: this.data.filterWarehouseIndex
    });
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
    this.syncFilterDraftFromApplied();
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
      filterWarehouseId: '',
      filterWarehouseIndex: 0,
      draftWarehouseIndex: 0,
      showFilterPanel: false
    });
    this.loadRows();
  },

  onFilterApply() {
    const idx = Number(this.data.draftWarehouseIndex) || 0;
    const warehouseId = (this._warehouseFilterIds || [])[idx] || '';
    const dateFrom = this.data.draftDateFrom || this.data.dateFrom;
    const dateTo = this.data.draftDateTo || this.data.dateTo;
    const datesChanged = dateFrom !== this.data.dateFrom || dateTo !== this.data.dateTo;

    this.patchFilterActive({
      dateFrom,
      dateTo,
      filterWarehouseId: warehouseId,
      filterWarehouseIndex: idx,
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

  onDraftWarehouseFilterChange(e) {
    const idx = Number(e.detail.value) || 0;
    this.setData({ draftWarehouseIndex: idx });
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
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const patch = (row) => row.id === id ? { ...row, showProductImage: false } : row;
    this._allRows = (this._allRows || []).map(patch);
    this.setData({ rows: (this.data.rows || []).map(patch) });
  },

  onRowTap(e) {
    this.closeFilterPanel();
    const batchKey = e.currentTarget.dataset.batchKey;
    if (!batchKey) return;
    const row = (this._allRows || []).find((r) => r.batchKey === batchKey);
    if (!row) return;
    const app = getApp();
    if (app.globalData) {
      app.globalData.stockInFlowDetail = {
        docNo: row.docNo,
        rows: row.rows
      };
    }
    wx.navigateTo({
      url: `/packageBusiness/production-order-stock-in-detail/production-order-stock-in-detail?docNo=${encodeURIComponent(row.docNo)}`
    });
  },

  applyFilter() {
    const filtered = filterStockInFlowRows(this._allRows || [], {
      keyword: this.data.searchKeyword,
      warehouseId: this.data.filterWarehouseId
    });
    this.setData({
      rows: filtered,
      stats: {
        batchCount: filtered.length,
        totalQty: sumStockInFlowQty(filtered)
      }
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
        fetchWarehousesAll().catch(() => [])]
        ),config = _await$Promise$all[0],orders = _await$Promise$all[1],productsRaw = _await$Promise$all[2],warehousesRaw = _await$Promise$all[3];
      const productionLinkMode = config && config.productionLinkMode || 'order';
      const orderMap = new Map((orders || []).map((o) => [o.id, o]));
      const products = normalizeMasterList(productsRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const warehouses = Array.isArray(warehousesRaw) ? warehousesRaw : warehousesRaw.data || [];
      const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
      this._warehouses = warehouses;
      this._warehouseFilterIds = buildWarehouseFilterIds(warehouses);

      const records = await fetchProductionRecords({
        type: 'STOCK_IN',
        all: 'true',
        startDate: dateInputToIsoStart(this.data.dateFrom),
        endDate: dateInputToIsoEndExclusive(this.data.dateTo)
      });
      const list = Array.isArray(records) ? records : records.data || [];
      const allRows = buildStockInFlowListRows(list, {
        productionLinkMode,
        orderMap,
        productMap,
        warehouseMap
      });
      this._allRows = allRows;
      this.applyFilter();

      const warehouseFilterLabels = buildWarehouseFilterLabels(warehouses);
      const filterWarehouseIndex = warehouseIndexForId(
        this._warehouseFilterIds,
        this.data.filterWarehouseId
      );
      const today = this._today || localTodayYmd();
      this.setData({
        loading: false,
        warehouseFilterLabels,
        filterWarehouseIndex,
        draftWarehouseIndex: filterWarehouseIndex,
        filterActive: computeFilterActive({
          ...this.data,
          filterWarehouseIndex
        }, today)
      });
    } catch {
      this._allRows = [];
      this.setData({ loading: false, rows: [], stats: { batchCount: 0, totalQty: 0 } });
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this._bootstrapping = false;
      this._loadedOnce = true;
    }
  }
});