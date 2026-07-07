const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { PSI_TYPE } = require('../config/purchaseBills.js');
const {
  buildPurchaseBillFlowRows,
  filterPurchaseBillFlowRows,
  computePurchaseBillFlowStats,
} = require('../utils/purchaseBills.js');
const { buildProductMap } = require('../utils/purchaseOrders.js');
const { fetchAllPsiRecords } = require('../utils/psiApi.js');
const { fetchProductsAll } = require('../utils/planApi.js');
const { fetchWarehousesAll } = require('../utils/orderApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { localTodayYmd } = require('../utils/dateYmd.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildWarehouseMap(warehouses) {
  const map = new Map();
  (warehouses || []).forEach((w) => {
    if (w && w.id) map.set(w.id, w);
  });
  return map;
}

Page({
  data: {
    loading: true,
    rows: [],
    searchKeyword: '',
    dateFrom: '',
    dateTo: '',
    showFilterPanel: false,
    filterActive: false,
    canViewAmount: false,
    emptyText: '所选条件下暂无流水',
    stats: { count: 0, totalQty: 0, totalAmount: 0, totalAmountText: '0.00' },
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
    if (!hasPermission(ctx.permissions || [], 'psi:purchase_bill:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      canViewAmount: hasPermission(ctx.permissions || [], 'psi:purchase_bill:amount'),
    });
    this.bootstrap();
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onPageScroll() {
    this.closeFilterPanel();
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.setData({ showFilterPanel: false });
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
    this.setData({ showFilterPanel: true });
  },

  onFilterReset() {
    const today = localTodayYmd();
    this.setData({
      dateFrom: today,
      dateTo: today,
      showFilterPanel: false,
    });
    this.applyClientFilter();
  },

  onFilterApply() {
    this.closeFilterPanel();
  },

  onDateFromChange(e) {
    this.setData({ dateFrom: e.detail.value || '' });
    this.applyClientFilter();
  },

  onDateToChange(e) {
    this.setData({ dateTo: e.detail.value || '' });
    this.applyClientFilter();
  },

  onRowTap(e) {
    this.closeFilterPanel();
    const docNumber = e.currentTarget.dataset.docNumber;
    if (!docNumber) return;
    wx.navigateTo({
      url: `/packageBusiness/psi-purchase-bill-detail/psi-purchase-bill-detail?docNumber=${encodeURIComponent(docNumber)}`,
    });
  },

  onProductImageError(e) {
    const id = e.currentTarget.dataset.id;
    const rows = (this.data.rows || []).map((row) => {
      if (row.id !== id) return row;
      return { ...row, showProductImage: false };
    });
    this.setData({ rows });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [purchaseBills, products, warehouses] = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll().catch(() => []),
        fetchWarehousesAll().catch(() => []),
      ]);
      const productMap = buildProductMap(products || []);
      const warehouseMap = buildWarehouseMap(warehouses || []);
      this._allRows = buildPurchaseBillFlowRows(purchaseBills || [], {
        productMap,
        warehouseMap,
        showAmount: this.data.canViewAmount,
      });
      this.applyClientFilter();
    } catch (err) {
      this.setData({ loading: false, rows: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  applyClientFilter() {
    const filtered = filterPurchaseBillFlowRows(this._allRows || [], {
      search: this.data.searchKeyword,
      dateFrom: this.data.dateFrom,
      dateTo: this.data.dateTo,
    });
    const canViewAmount = Boolean(this.data.canViewAmount);
    const rows = filtered.map((row) => ({
      ...row,
      showAmount: Boolean(canViewAmount && row.totalAmountText),
    }));
    const stats = computePurchaseBillFlowStats(rows);
    const today = localTodayYmd();
    const filterActive = this.data.dateFrom !== today || this.data.dateTo !== today;
    this.setData({
      loading: false,
      rows,
      stats,
      filterActive,
      emptyText: rows.length ? '' : '所选条件下暂无流水',
    });
  },
});
