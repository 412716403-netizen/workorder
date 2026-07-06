const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { DEFAULT_PAGE_SIZE, FINANCE_TYPE } = require('../../config/financePayments.js');
const {
  mapPaymentListCard,
  buildCategoryMap,
  buildWorkerMap,
  formatMoney,
} = require('../../utils/financePayments.js');
const {
  listFinanceRecordsPaginated,
  fetchFinanceCategoriesAll,
  normalizeMasterList,
} = require('../../utils/financeApi.js');
const { fetchProductsAll } = require('../../utils/planApi.js');
const { fetchWorkersAll } = require('../../utils/orderApi.js');
const { buildProductMap } = require('../../utils/purchaseOrders.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { localTodayYmd } = require('../../utils/dateYmd.js');
const { consumeListRefreshOnShow, LIST_ROUTES } = require('../../utils/saveNavigation.js');

const FLOW_LIST_ROUTE = LIST_ROUTES.FINANCE_PAYMENT_FLOW.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
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
      filterActive: true,
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
    } else if (consumeListRefreshOnShow(this, FLOW_LIST_ROUTE)) {
      this.bootstrap();
    }
  },

  onPullDownRefresh() {
    this.reloadList().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.loadPage(this.data.page + 1);
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
    this._searchTimer = setTimeout(() => this.reloadList(), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.reloadList();
  },

  onFilterTap() {
    this.setData({ showFilterPanel: !this.data.showFilterPanel });
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
      showFilterPanel: false,
    });
    this.reloadList();
  },

  onFilterApply() {
    const { dateFrom, dateTo } = this.data;
    this.setData({
      filterActive: Boolean(dateFrom || dateTo),
      showFilterPanel: false,
    });
    this.reloadList();
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/finance-payment-detail/finance-payment-detail?id=${encodeURIComponent(id)}`,
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
      const [categories, workers, products] = await Promise.all([
        fetchFinanceCategoriesAll(),
        fetchWorkersAll().catch(() => []),
        fetchProductsAll().catch(() => []),
      ]);
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
      ...(this.data.dateTo ? { endDate: dateToEndIso(this.data.dateTo) } : {}),
    };
  },

  async loadPage(page, replace) {
    if (!replace) this.setData({ loadingMore: true });
    try {
      const result = await listFinanceRecordsPaginated(this.buildQueryParams(page));
      const ctx = {
        categoryMap: this._categoryMap,
        workerMap: this._workerMap,
        productMap: this._productMap,
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
        emptyText: total ? '' : '所选条件下暂无流水',
      });
    } catch (err) {
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
