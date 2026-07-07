const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { WAREHOUSE_FLOW_TYPE_OPTIONS } = require('../config/warehouses.js');
const {
  computeWarehouseFlowRows,
  filterProductFlowRows,
  filterWarehouseFlowRows,
  computeWarehouseFlowTotals,
  formatWarehouseFlowQty,
  buildFlowDetailUrl,
} = require('../utils/warehouseFlow.js');
const { buildProductMap } = require('../utils/purchaseOrders.js');
const { buildWarehouseMap } = require('../utils/warehouseInventory.js');
const { fetchAllPsiRecords } = require('../utils/psiApi.js');
const { fetchProductionRecords, listOrdersPaginated } = require('../utils/orderApi.js');
const { fetchProductsAll } = require('../utils/planApi.js');
const { fetchWarehousesAll } = require('../utils/orderApi.js');
const { listProductNameSkuFromMap } = require('../utils/listProductThumb.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

const TYPE_FILTER_LABELS = WAREHOUSE_FLOW_TYPE_OPTIONS.map((o) => o.label);
const TYPE_FILTER_VALUES = WAREHOUSE_FLOW_TYPE_OPTIONS.map((o) => o.value);

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
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

function computeFilterActive(data) {
  if (data.showFilterPanel) return true;
  if (data.typeFilter) return true;
  if (data.filterWarehouseId && !data.scopedWarehouseId) return true;
  if (data.dateFrom) return true;
  if (data.dateTo) return true;
  return false;
}

function enrichFlowRow(row) {
  return {
    ...row,
    qtyText: formatWarehouseFlowQty(row.quantity),
    qtyClass: row.isOutbound ? 'wh-flow-row__qty--out' : 'wh-flow-row__qty--in',
  };
}

Page({
  data: {
    loading: true,
    rows: [],
    productName: '',
    productSku: '',
    showProductSku: false,
    warehouseName: '',
    scopedWarehouseId: '',
    showWarehouseFilter: true,
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
    emptyText: '暂无流水记录',
    stats: { inboundText: '0', outboundText: '0', netText: '0', count: 0 },
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._productId = options.productId ? decodeURIComponent(options.productId) : '';
    this._scopedWarehouseId = options.warehouseId ? decodeURIComponent(options.warehouseId) : '';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scopedWarehouseId: this._scopedWarehouseId,
      showWarehouseFilter: !this._scopedWarehouseId,
      filterWarehouseId: this._scopedWarehouseId,
    });
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!hasPermission((ctx && ctx.permissions) || [], 'psi:warehouse_list:view')) {
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
    this.closeFilterPanel();
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.patchFilterActive({ showFilterPanel: false });
  },

  patchFilterActive(extra) {
    this.setData({
      ...extra,
      filterActive: computeFilterActive({ ...this.data, ...extra }),
    });
  },

  syncFilterDraftFromApplied() {
    this.setData({
      draftDateFrom: this.data.dateFrom,
      draftDateTo: this.data.dateTo,
      draftTypeIndex: this.data.typeFilterIndex,
      draftWarehouseIndex: this.data.filterWarehouseIndex,
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
    this.syncFilterDraftFromApplied();
    this.patchFilterActive({ showFilterPanel: true });
  },

  onFilterReset() {
    this.patchFilterActive({
      dateFrom: '',
      dateTo: '',
      draftDateFrom: '',
      draftDateTo: '',
      typeFilter: '',
      typeFilterIndex: 0,
      draftTypeIndex: 0,
      filterWarehouseId: this._scopedWarehouseId || '',
      filterWarehouseIndex: this._scopedWarehouseId
        ? (this._warehouseFilterIds || []).indexOf(this._scopedWarehouseId)
        : 0,
      draftWarehouseIndex: this._scopedWarehouseId
        ? (this._warehouseFilterIds || []).indexOf(this._scopedWarehouseId)
        : 0,
      showFilterPanel: false,
    });
    this.bootstrap();
  },

  onFilterApply() {
    const typeIdx = Number(this.data.draftTypeIndex) || 0;
    const typeFilter = TYPE_FILTER_VALUES[typeIdx] || '';
    let filterWarehouseId = this._scopedWarehouseId || '';
    let filterWarehouseIndex = this.data.filterWarehouseIndex;
    if (!this._scopedWarehouseId) {
      const warehouseIdx = Number(this.data.draftWarehouseIndex) || 0;
      filterWarehouseId = (this._warehouseFilterIds || [])[warehouseIdx] || '';
      filterWarehouseIndex = warehouseIdx;
    }
    const dateFrom = this.data.draftDateFrom || '';
    const dateTo = this.data.draftDateTo || '';
    const datesChanged = dateFrom !== this.data.dateFrom || dateTo !== this.data.dateTo;

    this.patchFilterActive({
      dateFrom,
      dateTo,
      typeFilter,
      typeFilterIndex: typeIdx,
      filterWarehouseId,
      filterWarehouseIndex,
      showFilterPanel: false,
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
      const { dateFrom, dateTo } = this.data;
      const startDate = dateInputToIsoStart(dateFrom);
      const endDate = dateInputToIsoEndExclusive(dateTo);
      const prodParams = { types: 'STOCK_IN,STOCK_OUT,STOCK_RETURN' };
      if (startDate) prodParams.startDate = startDate;
      if (endDate) prodParams.endDate = endDate;

      const [products, warehouses, purchaseBills, salesBills, transfers, stocktakes, prodRecords, ordersPage] = await Promise.all([
        fetchProductsAll().catch(() => []),
        fetchWarehousesAll().catch(() => []),
        fetchAllPsiRecords('PURCHASE_BILL').catch(() => []),
        fetchAllPsiRecords('SALES_BILL').catch(() => []),
        fetchAllPsiRecords('TRANSFER').catch(() => []),
        fetchAllPsiRecords('STOCKTAKE').catch(() => []),
        fetchProductionRecords(prodParams).catch(() => []),
        listOrdersPaginated({ page: 1, pageSize: 500 }).catch(() => ({ data: [] })),
      ]);

      const warehouseList = Array.isArray(warehouses) ? warehouses : (warehouses.data || []);
      this._warehouseFilterIds = buildWarehouseFilterIds(warehouseList);
      const productMap = buildProductMap(Array.isArray(products) ? products : []);
      const warehouseMap = buildWarehouseMap(warehouseList);
      const nameFields = listProductNameSkuFromMap(productMap, this._productId);
      const wh = this._scopedWarehouseId ? warehouseMap.get(this._scopedWarehouseId) : null;

      let scopedWhIndex = 0;
      if (this._scopedWarehouseId) {
        scopedWhIndex = Math.max(0, (this._warehouseFilterIds || []).indexOf(this._scopedWarehouseId));
      }

      const psiRecords = []
        .concat(purchaseBills, salesBills, transfers, stocktakes)
        .filter((r) => {
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
        ordersList: ordersPage.data || [],
      });

      this.setData({
        productName: nameFields.productName,
        productSku: nameFields.productSku,
        showProductSku: nameFields.showProductSku,
        warehouseName: wh ? wh.name : '',
        warehouseFilterLabels: buildWarehouseFilterLabels(warehouseList),
        filterWarehouseIndex: scopedWhIndex,
        draftWarehouseIndex: scopedWhIndex,
      });
      this.applyClientFilter();
    } catch {
      this.setData({ loading: false, rows: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  applyClientFilter() {
    let filtered = filterProductFlowRows(this._allRows || [], this._productId, this._scopedWarehouseId);
    if (!this._scopedWarehouseId && this.data.filterWarehouseId) {
      filtered = filterWarehouseFlowRows(filtered, { warehouseId: this.data.filterWarehouseId });
    }
    filtered = filterWarehouseFlowRows(filtered, {
      searchKeyword: this.data.searchKeyword,
      dateFrom: this.data.dateFrom,
      dateTo: this.data.dateTo,
      typeFilter: this.data.typeFilter,
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
        count: filtered.length,
      },
      emptyText: filtered.length ? '' : '所选条件下暂无流水',
    });
  },
});
