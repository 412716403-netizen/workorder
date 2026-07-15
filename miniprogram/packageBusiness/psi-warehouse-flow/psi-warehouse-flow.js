const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/warehouses.js'),WAREHOUSE_FLOW_TYPE_OPTIONS = _require3.WAREHOUSE_FLOW_TYPE_OPTIONS;
const _require4 =





  require('../utils/warehouseFlow.js'),computeWarehouseFlowRows = _require4.computeWarehouseFlowRows,filterWarehouseFlowRows = _require4.filterWarehouseFlowRows,computeWarehouseFlowTotals = _require4.computeWarehouseFlowTotals,formatWarehouseFlowQty = _require4.formatWarehouseFlowQty,buildFlowDetailUrl = _require4.buildFlowDetailUrl;
const _require5 = require('../utils/purchaseOrders.js'),buildProductMap = _require5.buildProductMap;
const _require6 = require('../utils/warehouseInventory.js'),buildWarehouseMap = _require6.buildWarehouseMap;
const _require7 = require('../utils/psiApi.js'),fetchAllPsiRecords = _require7.fetchAllPsiRecords;
const _require8 = require('../utils/orderApi.js'),fetchProductionRecords = _require8.fetchProductionRecords,listOrdersPaginated = _require8.listOrdersPaginated;
const _require9 = require('../utils/planApi.js'),fetchProductsAll = _require9.fetchProductsAll;
const _require0 = require('../utils/orderApi.js'),fetchWarehousesAll = _require0.fetchWarehousesAll;
const _require1 = require('../utils/listProductThumb.js'),listProductNameSkuFields = _require1.listProductNameSkuFields;
const _require10 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require10.readNavBarMetrics,readWindowMetrics = _require10.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../utils/planFilterPanel.js');
const _require11 = require('../utils/dateYmd.js'),localTodayYmd = _require11.localTodayYmd;

const TYPE_FILTER_LABELS = WAREHOUSE_FLOW_TYPE_OPTIONS.map((o) => o.label);
const TYPE_FILTER_VALUES = WAREHOUSE_FLOW_TYPE_OPTIONS.map((o) => o.value);

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function dateInputToIsoStart(ymd) {
  if (!ymd) return '';
  return `${ymd}T00:00:00.000Z`;
}

function dateInputToIsoEndExclusive(ymd) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
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

function computeFilterActive(data, today) {
  if (data.showFilterPanel) return true;
  if (data.typeFilter) return true;
  if (data.filterWarehouseId) return true;
  if (data.dateFrom && data.dateFrom !== today) return true;
  if (data.dateTo && data.dateTo !== today) return true;
  return false;
}

function enrichFlowRow(row) {
  const nameFields = listProductNameSkuFields(
    row.productId && row.productName !== '—' ?
    { name: row.productName, sku: row.productSku } :
    null
  );
  return {
    ...row,
    productName: nameFields.productName,
    productSku: nameFields.productSku,
    showProductSku: nameFields.showProductSku,
    qtyText: formatWarehouseFlowQty(row.quantity),
    qtyClass: row.isOutbound ? 'wh-flow-row__qty--out' : 'wh-flow-row__qty--in'
  };
}

Page({
  data: {
    loading: true,
    rows: [],
    searchKeyword: '',
    dateFrom: '',
    dateTo: '',
    draftDateFrom: '',
    draftDateTo: '',
    typeFilter: '',
    typeFilterLabels: TYPE_FILTER_LABELS,
    draftTypeIndex: 0,
    typeFilterIndex: 0,
    filterWarehouseId: '',
    filterWarehouseIndex: 0,
    draftWarehouseIndex: 0,
    warehouseFilterLabels: ['全部仓库'],
    showFilterPanel: false,
    filterActive: false,
    emptyText: '所选条件下暂无流水',
    stats: { inboundText: '0', outboundText: '0', netText: '0', count: 0 },
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad() {
    const nav = readNavBarMetrics();
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
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    if (!hasPermission(ctx.permissions || [], 'psi:warehouse_flow:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    if (!this._initialized) {
      this._initialized = true;
      this.bootstrap();
    }
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onPageScroll() {
    if (!shouldCloseFilterPanelOnScroll(this)) return;
    this.closeFilterPanel();
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.patchFilterActive({ showFilterPanel: false });
  },

  patchFilterActive(extra) {
    const today = this._today || localTodayYmd();
    this.setData({
      ...extra,
      filterActive: computeFilterActive({ ...this.data, ...extra }, today)
    });
  },

  syncFilterDraftFromApplied() {
    this.setData({
      draftDateFrom: this.data.dateFrom,
      draftDateTo: this.data.dateTo,
      draftTypeIndex: this.data.typeFilterIndex,
      draftWarehouseIndex: this.data.filterWarehouseIndex
    });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.applyClientFilter(), 300);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyClientFilter();
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
      filterWarehouseId: '',
      filterWarehouseIndex: 0,
      draftWarehouseIndex: 0,
      showFilterPanel: false
    });
    this.bootstrap();
  },

  onFilterApply() {
    const typeIdx = Number(this.data.draftTypeIndex) || 0;
    const typeFilter = TYPE_FILTER_VALUES[typeIdx] || '';
    const warehouseIdx = Number(this.data.draftWarehouseIndex) || 0;
    const filterWarehouseId = (this._warehouseFilterIds || [])[warehouseIdx] || '';
    const dateFrom = this.data.draftDateFrom || this.data.dateFrom;
    const dateTo = this.data.draftDateTo || this.data.dateTo;
    const datesChanged = dateFrom !== this.data.dateFrom || dateTo !== this.data.dateTo;

    this.patchFilterActive({
      dateFrom,
      dateTo,
      typeFilter,
      typeFilterIndex: typeIdx,
      filterWarehouseId,
      filterWarehouseIndex: warehouseIdx,
      showFilterPanel: false
    });

    if (datesChanged) {
      this.bootstrap();
      return;
    }
    this.applyClientFilter();
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

  onDraftWarehouseFilterChange(e) {
    this.setData({ draftWarehouseIndex: Number(e.detail.value) || 0 });
  },

  onRowTap(e) {
    this.closeFilterPanel();
    const idx = Number(e.currentTarget.dataset.index);
    const row = (this._filteredRows || [])[idx];
    if (!row) return;
    const url = buildFlowDetailUrl(row);
    if (url) wx.navigateTo({ url });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const _this$data = this.data,dateFrom = _this$data.dateFrom,dateTo = _this$data.dateTo;
      const startDate = dateInputToIsoStart(dateFrom);
      const endDate = dateInputToIsoEndExclusive(dateTo);
      const _await$Promise$all = await Promise.all([
        fetchProductsAll().catch(() => []),
        fetchWarehousesAll().catch(() => []),
        fetchAllPsiRecords('PURCHASE_BILL').catch(() => []),
        fetchAllPsiRecords('SALES_BILL').catch(() => []),
        fetchAllPsiRecords('TRANSFER').catch(() => []),
        fetchAllPsiRecords('STOCKTAKE').catch(() => []),
        fetchProductionRecords({
          types: 'STOCK_IN,STOCK_OUT,STOCK_RETURN',
          startDate,
          endDate
        }).catch(() => []),
        listOrdersPaginated({ page: 1, pageSize: 500 }).catch(() => ({ data: [] }))]
        ),products = _await$Promise$all[0],warehouses = _await$Promise$all[1],purchaseBills = _await$Promise$all[2],salesBills = _await$Promise$all[3],transfers = _await$Promise$all[4],stocktakes = _await$Promise$all[5],prodRecords = _await$Promise$all[6],ordersPage = _await$Promise$all[7];

      const warehouseList = Array.isArray(warehouses) ? warehouses : warehouses.data || [];
      this._warehouseFilterIds = buildWarehouseFilterIds(warehouseList);
      const productMap = buildProductMap(Array.isArray(products) ? products : []);
      const warehouseMap = buildWarehouseMap(warehouseList);
      const psiRecords = [].
      concat(purchaseBills, salesBills, transfers, stocktakes).
      filter((r) => {
        const ds = (r.createdAt || r.timestamp || '').toString().slice(0, 10);
        if (dateFrom && ds < dateFrom) return false;
        if (dateTo && ds > dateTo) return false;
        return true;
      });

      this._allRows = computeWarehouseFlowRows({
        recordsList: psiRecords,
        prodRecords,
        productMap,
        warehouseMap,
        ordersList: ordersPage.data || []
      });

      this.setData({
        warehouseFilterLabels: buildWarehouseFilterLabels(warehouseList)
      });
      this.applyClientFilter();
    } catch {
      this.setData({ loading: false, rows: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  applyClientFilter() {
    const filtered = filterWarehouseFlowRows(this._allRows || [], {
      searchKeyword: this.data.searchKeyword,
      dateFrom: this.data.dateFrom,
      dateTo: this.data.dateTo,
      typeFilter: this.data.typeFilter,
      warehouseId: this.data.filterWarehouseId
    });
    this._filteredRows = filtered.map(enrichFlowRow);
    const totals = computeWarehouseFlowTotals(filtered);
    this.setData({
      loading: false,
      rows: this._filteredRows,
      stats: {
        inboundText: formatWarehouseFlowQty(totals.inboundTotal),
        outboundText: formatWarehouseFlowQty(totals.outboundTotal),
        netText: formatWarehouseFlowQty(totals.netChange),
        count: filtered.length
      },
      emptyText: filtered.length ? '' : '所选条件下暂无流水'
    });
  }
});