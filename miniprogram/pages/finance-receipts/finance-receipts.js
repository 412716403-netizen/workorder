const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { DEFAULT_PAGE_SIZE, FINANCE_TYPE } = require('../../config/financeReceipts.js');
const {
  mapReceiptListCard,
  buildCategoryMap,
  buildWorkerMap,
} = require('../../utils/financeReceipts.js');
const {
  listFinanceRecordsPaginated,
  fetchFinanceCategoriesAll,
  normalizeMasterList,
} = require('../../utils/financeApi.js');
const { fetchProductsAll } = require('../../utils/planApi.js');
const { fetchWorkersAll } = require('../../utils/orderApi.js');
const { buildProductMap } = require('../../utils/purchaseOrders.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { consumeListRefreshOnShow, LIST_ROUTES } = require('../../utils/saveNavigation.js');

const HUB_LIST_ROUTE = LIST_ROUTES.FINANCE_RECEIPTS.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
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
    emptyText: '暂无收款单',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    hasMore: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });

    const id = options.id ? decodeURIComponent(options.id) : '';
    if (id) {
      wx.redirectTo({
        url: `/pages/finance-receipt-detail/finance-receipt-detail?id=${encodeURIComponent(id)}`,
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
    if (!hasPermission(ctx.permissions || [], 'finance:receipt:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      canViewFlow: hasPermission(ctx.permissions || [], 'finance:receipt:view'),
      canCreate: hasPermission(ctx.permissions || [], 'finance:receipt:create'),
    });
    if (!this._initialized) {
      this.bootstrap();
    } else if (consumeListRefreshOnShow(this, HUB_LIST_ROUTE)) {
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

  onHeaderBack() {
    wx.navigateBack();
  },

  onCreateTap() {
    if (!this.data.canCreate) {
      wx.showToast({ title: '暂无新建权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/finance-receipt-edit/finance-receipt-edit' });
  },

  onFlowTap() {
    wx.navigateTo({ url: '/pages/finance-receipt-flow/finance-receipt-flow' });
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
      url: `/pages/finance-receipt-detail/finance-receipt-detail?id=${encodeURIComponent(id)}`,
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

  async loadPage(page, replace) {
    const pageSize = this.data.pageSize;
    const search = (this.data.searchKeyword || '').trim();
    if (!replace) this.setData({ loadingMore: true });
    try {
      const result = await listFinanceRecordsPaginated({
        type: FINANCE_TYPE,
        ...(search ? { search } : {}),
        page,
        pageSize,
      });
      const ctx = {
        categoryMap: this._categoryMap,
        workerMap: this._workerMap,
        productMap: this._productMap,
      };
      const nextCards = (result.data || []).map((rec) => mapReceiptListCard(rec, ctx));
      const cards = replace ? nextCards : (this.data.cards || []).concat(nextCards);
      const total = typeof result.total === 'number' ? result.total : cards.length;
      this.setData({
        loading: false,
        loadingMore: false,
        cards,
        page,
        total,
        hasMore: cards.length < total,
        emptyText: total ? '' : (search ? '无匹配收款单' : '暂无收款单'),
      });
    } catch (err) {
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
