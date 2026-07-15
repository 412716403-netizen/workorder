const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission,filterByPermission = _require2.filterByPermission;
const _require3 =



  require('../config/salesOrders.js'),DEFAULT_PAGE_SIZE = _require3.DEFAULT_PAGE_SIZE,PSI_TYPE = _require3.PSI_TYPE,SALES_ORDER_SHORTCUTS = _require3.SALES_ORDER_SHORTCUTS;
const _require4 =




  require('../utils/salesOrders.js'),parseSalesOrderSearch = _require4.parseSalesOrderSearch,buildSalesOrderListCards = _require4.buildSalesOrderListCards,slimSalesOrderListCard = _require4.slimSalesOrderListCard,buildProductMap = _require4.buildProductMap;
const _require5 = require('../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require5.groupRecordsByDocNumber;
const _require6 = require('../utils/psiApi.js'),fetchAllPsiRecords = _require6.fetchAllPsiRecords;
const _require7 = require('../utils/planApi.js'),fetchProductsAll = _require7.fetchProductsAll,fetchDictionaries = _require7.fetchDictionaries;
const _require8 = require('../utils/productionPlans.js'),normalizeAppDictionaries = _require8.normalizeAppDictionaries;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../utils/planFilterPanel.js');
const _require0 = require('../utils/saveNavigation.js'),shouldHubListRefetch = _require0.shouldHubListRefetch,trackHubListHidden = _require0.trackHubListHidden,LIST_ROUTES = _require0.LIST_ROUTES;

const HUB_LIST_ROUTE = LIST_ROUTES.PSI_SALES_ORDERS.replace(/^\//, '');

function buildFilterShortcuts(permissions) {
  return filterByPermission(SALES_ORDER_SHORTCUTS, permissions || []);
}

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
    headerBlockHeight: 88
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
    });

    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    if (docNumber) {
      wx.redirectTo({
        url: `/packageBusiness/psi-sales-order-detail/psi-sales-order-detail?docNumber=${encodeURIComponent(docNumber)}`
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
      filterShortcuts: buildFilterShortcuts(perms)
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

  onPageScroll() {
    if (!this.data.showFilterPanel) return;
    if (!shouldCloseFilterPanelOnScroll(this)) return;
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
    wx.navigateTo({ url: '/packageBusiness/psi-sales-order-edit/psi-sales-order-edit' });
  },

  onShortcutTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ showFilterPanel: false });
    if (id === 'order-flow') {
      wx.navigateTo({ url: '/packageBusiness/psi-sales-order-flow/psi-sales-order-flow' });
      return;
    }
    if (id === 'pending-ship') {
      wx.navigateTo({ url: '/packageBusiness/psi-sales-order-pending-ship/psi-sales-order-pending-ship' });
    }
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    markFilterPanelOpen(this);
    this.setData({
      showFilterPanel: true,
      draftOnlyShowNotFullyShipped: this.data.onlyShowNotFullyShipped
    });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.setData({
      showFilterPanel: false,
      filterActive: this.data.onlyShowNotFullyShipped
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
      url: `/packageBusiness/psi-sales-order-detail/psi-sales-order-detail?docNumber=${encodeURIComponent(docNumber)}`
    });
  },

  onAllocateTap(e) {
    const docNumber = e.currentTarget.dataset.docNumber;
    const lineGroupId = e.currentTarget.dataset.lineGroupId;
    if (!docNumber || !lineGroupId) return;
    wx.navigateTo({
      url: `/packageBusiness/psi-sales-order-allocate/psi-sales-order-allocate?docNumber=${encodeURIComponent(docNumber)}&lineGroupId=${encodeURIComponent(lineGroupId)}`
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
        })
      };
    });
    this.setData({ cards });
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll().catch(() => []),
        fetchDictionaries().catch(() => ({}))]
        ),salesOrders = _await$Promise$all[0],products = _await$Promise$all[1],dictionaries = _await$Promise$all[2];
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
      canAllocate: this.data.canAllocate
    };
    return buildSalesOrderListCards(
      groups,
      parsed.search,
      this.data.onlyShowNotFullyShipped,
      ctx
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
      emptyText: allCards.length ? '' : this.data.searchKeyword || this.data.onlyShowNotFullyShipped ?
      '无匹配销售订单' :
      '暂无销售订单',
      filterActive: this.data.onlyShowNotFullyShipped
    });
    return Promise.resolve();
  }
});