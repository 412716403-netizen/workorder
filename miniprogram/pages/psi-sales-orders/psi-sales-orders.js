const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission, filterByPermission } = require('../../utils/permissions.js');
const {
  DEFAULT_PAGE_SIZE,
  PSI_TYPE,
  SALES_ORDER_SHORTCUTS,
} = require('../../config/salesOrders.js');
const {
  parseSalesOrderSearch,
  buildSalesOrderListCards,
  slimSalesOrderListCard,
  buildProductMap,
} = require('../../utils/salesOrders.js');
const { groupRecordsByDocNumber } = require('../../utils/psiOpsAggregators.js');
const { fetchAllPsiRecords } = require('../../utils/psiApi.js');
const { fetchProductsAll, fetchDictionaries } = require('../../utils/planApi.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { consumeListRefreshOnShow, LIST_ROUTES } = require('../../utils/saveNavigation.js');

const HUB_LIST_ROUTE = LIST_ROUTES.PSI_SALES_ORDERS.replace(/^\//, '');

function buildFilterShortcuts(permissions) {
  return filterByPermission(SALES_ORDER_SHORTCUTS, permissions || []);
}

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
    onlyShowNotFullyShipped: false,
    draftOnlyShowNotFullyShipped: false,
    showFilterPanel: false,
    filterActive: false,
    filterShortcuts: [],
    canCreate: false,
    canAllocate: false,
    canViewAmount: false,
    emptyText: '暂无销售订单',
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

    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    if (docNumber) {
      wx.redirectTo({
        url: `/pages/psi-sales-order-detail/psi-sales-order-detail?docNumber=${encodeURIComponent(docNumber)}`,
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
    if (!hasPermission(ctx.permissions || [], 'psi:sales_order:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    const perms = ctx.permissions || [];
    this.setData({
      canCreate: hasPermission(perms, 'psi:sales_order:create'),
      canViewAmount: hasPermission(perms, 'psi:sales_order:amount'),
      canAllocate: hasPermission(perms, 'psi:sales_order_allocation:allow'),
      filterShortcuts: buildFilterShortcuts(perms),
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

  onPageScroll() {
    if (!this.data.showFilterPanel) return;
    if (this._filterOpenedAt && Date.now() - this._filterOpenedAt < 400) return;
    this.closeFilterPanel();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onCreateTap() {
    if (!this.data.canCreate) {
      wx.showToast({ title: '暂无新建权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/psi-sales-order-edit/psi-sales-order-edit' });
  },

  onShortcutTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    this.setData({ showFilterPanel: false });
    if (id === 'order-flow') {
      wx.navigateTo({ url: '/pages/psi-sales-order-flow/psi-sales-order-flow' });
      return;
    }
    if (id === 'pending-ship') {
      wx.navigateTo({ url: '/pages/psi-sales-order-pending-ship/psi-sales-order-pending-ship' });
    }
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    this._filterOpenedAt = Date.now();
    this.setData({
      showFilterPanel: true,
      draftOnlyShowNotFullyShipped: this.data.onlyShowNotFullyShipped,
    });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.setData({
      showFilterPanel: false,
      filterActive: this.data.onlyShowNotFullyShipped,
    });
  },

  onNotFullyShippedToggle() {
    const next = !this.data.draftOnlyShowNotFullyShipped;
    this.setData({ draftOnlyShowNotFullyShipped: next, onlyShowNotFullyShipped: next, filterActive: next });
    this.reloadList();
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
    const docNumber = e.currentTarget.dataset.docNumber;
    if (!docNumber) return;
    wx.navigateTo({
      url: `/pages/psi-sales-order-detail/psi-sales-order-detail?docNumber=${encodeURIComponent(docNumber)}`,
    });
  },

  onAllocateTap(e) {
    const docNumber = e.currentTarget.dataset.docNumber;
    const lineGroupId = e.currentTarget.dataset.lineGroupId;
    if (!docNumber || !lineGroupId) return;
    wx.navigateTo({
      url: `/pages/psi-sales-order-allocate/psi-sales-order-allocate?docNumber=${encodeURIComponent(docNumber)}&lineGroupId=${encodeURIComponent(lineGroupId)}`,
    });
  },

  onProductImageError(e) {
    const docNumber = e.currentTarget.dataset.docNumber;
    const lineGroupId = e.currentTarget.dataset.lineGroupId;
    const cards = (this.data.cards || []).map((card) => {
      if (card.docNumber !== docNumber) return card;
      return {
        ...card,
        lines: (card.lines || []).map((line) => {
          if (line.lineGroupId !== lineGroupId) return line;
          return { ...line, showProductImage: false };
        }),
      };
    });
    this.setData({ cards });
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      const [salesOrders, products, dictionaries] = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
      ]);
      this._salesOrders = salesOrders || [];
      this._productMap = buildProductMap(products || []);
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      await this.reloadList();
    } catch (err) {
      this.setData({ loading: false, cards: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  buildFilteredCards() {
    const groups = groupRecordsByDocNumber(this._salesOrders || [], PSI_TYPE);
    const parsed = parseSalesOrderSearch(this.data.searchKeyword);
    const ctx = {
      productMap: this._productMap,
      dictionaries: this._dictionaries,
      showAmount: this.data.canViewAmount,
      canAllocate: this.data.canAllocate,
    };
    return buildSalesOrderListCards(
      groups,
      parsed.search,
      this.data.onlyShowNotFullyShipped,
      ctx,
    ).map(slimSalesOrderListCard);
  },

  async reloadList() {
    if (!this._initialized || !this._salesOrders) {
      return this.bootstrap();
    }
    this.setData({ loading: true, page: 1 });
    try {
      this._salesOrders = await fetchAllPsiRecords(PSI_TYPE);
      return this.loadPage(1);
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '刷新失败', icon: 'none' });
    }
  },

  loadPage(page) {
    const allCards = this.buildFilteredCards();
    const pageSize = this.data.pageSize;
    const slice = allCards.slice(0, page * pageSize);
    const hasMore = slice.length < allCards.length;
    this.setData({
      loading: false,
      loadingMore: false,
      cards: slice,
      page,
      total: allCards.length,
      hasMore,
      emptyText: allCards.length ? '' : (this.data.searchKeyword || this.data.onlyShowNotFullyShipped
        ? '无匹配销售订单'
        : '暂无销售订单'),
      filterActive: this.data.onlyShowNotFullyShipped,
    });
    return Promise.resolve();
  },
});
