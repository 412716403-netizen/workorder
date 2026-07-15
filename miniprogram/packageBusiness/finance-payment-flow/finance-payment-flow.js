const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/financePayments.js'),DEFAULT_PAGE_SIZE = _require3.DEFAULT_PAGE_SIZE,FINANCE_TYPE = _require3.FINANCE_TYPE;
const _require4 =




  require('../utils/financePayments.js'),mapPaymentListCard = _require4.mapPaymentListCard,buildCategoryMap = _require4.buildCategoryMap,buildWorkerMap = _require4.buildWorkerMap,formatMoney = _require4.formatMoney;
const _require5 =



  require('../../utils/financeApi.js'),listFinanceRecordsPaginated = _require5.listFinanceRecordsPaginated,fetchFinanceCategoriesAll = _require5.fetchFinanceCategoriesAll,normalizeMasterList = _require5.normalizeMasterList;
const _require6 = require('../utils/planApi.js'),fetchProductsAll = _require6.fetchProductsAll;
const _require7 = require('../utils/orderApi.js'),fetchWorkersAll = _require7.fetchWorkersAll;
const _require8 = require('../utils/purchaseOrders.js'),buildProductMap = _require8.buildProductMap;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../utils/planFilterPanel.js');
const _require0 = require('../utils/dateYmd.js'),localTodayYmd = _require0.localTodayYmd;
const _require1 = require('../utils/saveNavigation.js'),shouldHubListRefetch = _require1.shouldHubListRefetch,trackHubListHidden = _require1.trackHubListHidden,LIST_ROUTES = _require1.LIST_ROUTES;

const FLOW_LIST_ROUTE = LIST_ROUTES.FINANCE_PAYMENT_FLOW.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function dateToStartIso(ymd) {
  if (!ymd) return '';
  return `${ymd}T00:00:00.000`;
}

function dateToEndIso(ymd) {
  if (!ymd) return '';
  return `${ymd}T23:59:59.999`;
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    cards: [],
    searchKeyword: '',
    dateFrom: '',
    dateTo: '',
    showFilterPanel: false,
    filterActive: false,
    emptyText: '所选条件下暂无流水',
    stats: { count: 0, amountText: '¥0.00' },
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    hasMore: false,
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
      dateTo: today,
      filterActive: true
    });
    this._initialized = false;
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
    if (!hasPermission(ctx.permissions || [], 'finance:payment:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    if (!this._initialized) {
      this.bootstrap();
    } else if (shouldHubListRefetch(this, FLOW_LIST_ROUTE)) {
      this.bootstrap();
    }
  },

  onHide() {
    trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.reloadList().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.loadPage(this.data.page + 1);
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
    this._searchTimer = setTimeout(() => this.reloadList(), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.reloadList();
  },

  onFilterTap() {
    const next = !this.data.showFilterPanel;
    if (next) markFilterPanelOpen(this);
    this.setData({ showFilterPanel: next });
  },

  onDateFromChange(e) {
    this.setData({ dateFrom: e.detail.value || '' });
  },

  onDateToChange(e) {
    this.setData({ dateTo: e.detail.value || '' });
  },

  onFilterReset() {
    const today = localTodayYmd();
    this.setData({
      dateFrom: today,
      dateTo: today,
      filterActive: true,
      showFilterPanel: false
    });
    this.reloadList();
  },

  onFilterApply() {
    const _this$data = this.data,dateFrom = _this$data.dateFrom,dateTo = _this$data.dateTo;
    this.setData({
      filterActive: Boolean(dateFrom || dateTo),
      showFilterPanel: false
    });
    this.reloadList();
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/packageBusiness/finance-payment-detail/finance-payment-detail?id=${encodeURIComponent(id)}`
    });
  },

  onProductImageError(e) {
    const id = e.currentTarget.dataset.id;
    const cards = (this.data.cards || []).map((card) => {
      if (card.id !== id) return card;
      return { ...card, showProductImage: false };
    });
    this.setData({ cards });
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchFinanceCategoriesAll(),
        fetchWorkersAll().catch(() => []),
        fetchProductsAll().catch(() => [])]
        ),categories = _await$Promise$all[0],workers = _await$Promise$all[1],products = _await$Promise$all[2];
      this._categoryMap = buildCategoryMap(normalizeMasterList(categories));
      this._workerMap = buildWorkerMap(normalizeMasterList(workers));
      this._productMap = buildProductMap(products || []);
      await this.reloadList();
    } catch (err) {
      this.setData({ loading: false, cards: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async reloadList() {
    this.setData({ loading: true, page: 1 });
    return this.loadPage(1, true);
  },

  buildQueryParams(page) {
    const search = (this.data.searchKeyword || '').trim();
    return {
      type: FINANCE_TYPE,
      page,
      pageSize: this.data.pageSize,
      ...(search ? { search } : {}),
      ...(this.data.dateFrom ? { startDate: dateToStartIso(this.data.dateFrom) } : {}),
      ...(this.data.dateTo ? { endDate: dateToEndIso(this.data.dateTo) } : {})
    };
  },

  async loadPage(page, replace) {
    if (!replace) this.setData({ loadingMore: true });
    try {
      const result = await listFinanceRecordsPaginated(this.buildQueryParams(page));
      const ctx = {
        categoryMap: this._categoryMap,
        workerMap: this._workerMap,
        productMap: this._productMap
      };
      const nextCards = (result.data || []).map((rec) => mapPaymentListCard(rec, ctx));
      const cards = replace ? nextCards : (this.data.cards || []).concat(nextCards);
      const total = typeof result.total === 'number' ? result.total : cards.length;
      const amountSum = cards.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

      this.setData({
        loading: false,
        loadingMore: false,
        cards,
        page,
        total,
        hasMore: cards.length < total,
        stats: { count: total, amountText: formatMoney(amountSum) },
        emptyText: total ? '' : '所选条件下暂无流水'
      });
    } catch (err) {
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});