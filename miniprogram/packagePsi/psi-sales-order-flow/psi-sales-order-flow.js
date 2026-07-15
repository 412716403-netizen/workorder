const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =


  require('../config/salesOrders.js'),PSI_TYPE = _require3.PSI_TYPE,SALES_ORDER_FLOW_STATUS_OPTIONS = _require3.SALES_ORDER_FLOW_STATUS_OPTIONS;
const _require4 =




  require('../utils/salesOrders.js'),buildSalesOrderFlowRows = _require4.buildSalesOrderFlowRows,filterSalesOrderFlowRows = _require4.filterSalesOrderFlowRows,computeSalesOrderFlowStats = _require4.computeSalesOrderFlowStats,buildProductMap = _require4.buildProductMap;
const _require5 = require('../../utils/psiApi.js'),fetchAllPsiRecords = _require5.fetchAllPsiRecords;
const _require6 = require('../../utils/planApi.js'),fetchProductsAll = _require6.fetchProductsAll;
const _require7 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require7.readNavBarMetrics,readWindowMetrics = _require7.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../../utils/planFilterPanel.js');
const _require8 = require('../../utils/dateYmd.js'),localTodayYmd = _require8.localTodayYmd;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
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
    headerBlockHeight: 88
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const today = localTodayYmd();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      dateFrom: today,
      dateTo: today
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
      canViewAmount: hasPermission(ctx.permissions || [], 'psi:sales_order:amount')
    });
    this.bootstrap();
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
    markFilterPanelOpen(this);
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
      url: `/packagePsi/psi-sales-order-detail/psi-sales-order-detail?docNumber=${encodeURIComponent(docNumber)}`
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
      const _await$Promise$all = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll().catch(() => [])]
        ),salesOrders = _await$Promise$all[0],products = _await$Promise$all[1];
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
      dateTo: this.data.dateTo
    });
    const canViewAmount = Boolean(this.data.canViewAmount);
    const rows = filtered.map((row) => ({
      ...row,
      showAmount: Boolean(canViewAmount && row.totalAmountText)
    }));
    const stats = computeSalesOrderFlowStats(rows);
    const today = localTodayYmd();
    const filterActive = this.data.statusFilter !== 'all' ||
    this.data.dateFrom !== today ||
    this.data.dateTo !== today;
    this.setData({
      loading: false,
      rows,
      stats,
      filterActive,
      emptyText: rows.length ? '' : '所选条件下暂无流水'
    });
  }
});