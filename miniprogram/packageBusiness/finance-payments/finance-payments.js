const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/financePayments.js'),DEFAULT_PAGE_SIZE = _require3.DEFAULT_PAGE_SIZE,FINANCE_TYPE = _require3.FINANCE_TYPE;
const _require4 =



  require('../utils/financePayments.js'),mapPaymentListCard = _require4.mapPaymentListCard,buildCategoryMap = _require4.buildCategoryMap,buildWorkerMap = _require4.buildWorkerMap;
const _require5 =



  require('../../utils/financeApi.js'),listFinanceRecordsPaginated = _require5.listFinanceRecordsPaginated,fetchFinanceCategoriesAll = _require5.fetchFinanceCategoriesAll,normalizeMasterList = _require5.normalizeMasterList;
const _require6 = require('../utils/planApi.js'),fetchProductsAll = _require6.fetchProductsAll;
const _require7 = require('../utils/orderApi.js'),fetchWorkersAll = _require7.fetchWorkersAll;
const _require8 = require('../utils/purchaseOrders.js'),buildProductMap = _require8.buildProductMap;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;
const _require0 = require('../utils/saveNavigation.js'),shouldHubListRefetch = _require0.shouldHubListRefetch,trackHubListHidden = _require0.trackHubListHidden,LIST_ROUTES = _require0.LIST_ROUTES;

const HUB_LIST_ROUTE = LIST_ROUTES.FINANCE_PAYMENTS.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    cards: [],
    searchKeyword: '',
    canViewFlow: false,
    canCreate: false,
    emptyText: '暂无付款单',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    hasMore: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
    });

    const id = options.id ? decodeURIComponent(options.id) : '';
    if (id) {
      wx.redirectTo({
        url: `/packageBusiness/finance-payment-detail/finance-payment-detail?id=${encodeURIComponent(id)}`
      });
      return;
    }
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
    this.setData({
      canViewFlow: hasPermission(ctx.permissions || [], 'finance:payment:view'),
      canCreate: hasPermission(ctx.permissions || [], 'finance:payment:create')
    });
    if (!this._initialized) {
      this.bootstrap();
    } else if (shouldHubListRefetch(this, HUB_LIST_ROUTE)) {
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

  onHeaderBack() {
    wx.navigateBack();
  },

  onCreateTap() {
    if (!this.data.canCreate) {
      wx.showToast({ title: '暂无新建权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/packageBusiness/finance-payment-edit/finance-payment-edit' });
  },

  onFlowTap() {
    wx.navigateTo({ url: '/packageBusiness/finance-payment-flow/finance-payment-flow' });
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

  async loadPage(page, replace) {
    const pageSize = this.data.pageSize;
    const search = (this.data.searchKeyword || '').trim();
    if (!replace) this.setData({ loadingMore: true });
    try {
      const result = await listFinanceRecordsPaginated({
        type: FINANCE_TYPE,
        ...(search ? { search } : {}),
        page,
        pageSize
      });
      const ctx = {
        categoryMap: this._categoryMap,
        workerMap: this._workerMap,
        productMap: this._productMap
      };
      const nextCards = (result.data || []).map((rec) => mapPaymentListCard(rec, ctx));
      const cards = replace ? nextCards : (this.data.cards || []).concat(nextCards);
      const total = typeof result.total === 'number' ? result.total : cards.length;
      this.setData({
        loading: false,
        loadingMore: false,
        cards,
        page,
        total,
        hasMore: cards.length < total,
        emptyText: total ? '' : search ? '无匹配付款单' : '暂无付款单'
      });
    } catch (err) {
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});