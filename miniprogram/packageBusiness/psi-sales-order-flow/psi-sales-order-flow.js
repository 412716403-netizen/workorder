const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  PSI_TYPE,
  SALES_ORDER_FLOW_STATUS_OPTIONS,
} = require('../config/salesOrders.js');
const {
  buildSalesOrderFlowRows,
  filterSalesOrderFlowRows,
  computeSalesOrderFlowStats,
  buildProductMap,
} = require('../utils/salesOrders.js');
const { fetchAllPsiRecords } = require('../utils/psiApi.js');
const { fetchProductsAll } = require('../utils/planApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { localTodayYmd } = require('../utils/dateYmd.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    rows: [],
    searchKeyword: '',
    statusFilter: 'all',
    dateFrom: '',
    dateTo: '',
    statusOptions: SALES_ORDER_FLOW_STATUS_OPTIONS,
    showFilterPanel: false,
    filterActive: false,
    canViewAmount: false,
    emptyText: '所选条件下暂无流水',
    stats: { count: 0, totalQty: 0, totalShipped: 0 },
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
    if (!hasPermission(ctx.permissions || [], 'psi:sales_order:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      canViewAmount: hasPermission(ctx.permissions || [], 'psi:sales_order:amount'),
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
    this.setData({ dateFrom: today, dateTo: today, statusFilter: 'all', showFilterPanel: false });
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

  onStatusChipTap(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.value || 'all' });
    this.applyClientFilter();
  },

  onRowTap(e) {
    this.closeFilterPanel();
    const docNumber = e.currentTarget.dataset.docNumber;
    if (!docNumber) return;
    wx.navigateTo({
      url: `/packageBusiness/psi-sales-order-detail/psi-sales-order-detail?docNumber=${encodeURIComponent(docNumber)}`,
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
      const [salesOrders, products] = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll().catch(() => []),
      ]);
      const productMap = buildProductMap(products || []);
      this._allRows = buildSalesOrderFlowRows(salesOrders || [], productMap);
      this.applyClientFilter();
    } catch (err) {
      this.setData({ loading: false, rows: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  applyClientFilter() {
    const filtered = filterSalesOrderFlowRows(this._allRows || [], {
      search: this.data.searchKeyword,
      status: this.data.statusFilter,
      dateFrom: this.data.dateFrom,
      dateTo: this.data.dateTo,
    });
    const canViewAmount = Boolean(this.data.canViewAmount);
    const rows = filtered.map((row) => ({
      ...row,
      showAmount: Boolean(canViewAmount && row.totalAmountText),
    }));
    const stats = computeSalesOrderFlowStats(rows);
    const today = localTodayYmd();
    const filterActive = this.data.statusFilter !== 'all'
      || this.data.dateFrom !== today
      || this.data.dateTo !== today;
    this.setData({
      loading: false,
      rows,
      stats,
      filterActive,
      emptyText: rows.length ? '' : '所选条件下暂无流水',
    });
  },
});
