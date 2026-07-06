const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  DEFAULT_PAGE_SIZE,
  PSI_TYPE,
  PSI_BILL_TYPE,
} = require('../../config/purchaseOrders.js');
const {
  parsePurchaseOrderSearch,
  buildPurchaseOrderListCards,
  slimPurchaseOrderListCard,
  buildProductMap,
} = require('../../utils/purchaseOrders.js');
const { groupRecordsByDocNumber, sumReceivedByOrderLine } = require('../../utils/psiOpsAggregators.js');
const { fetchAllPsiRecords } = require('../../utils/psiApi.js');
const { fetchProductsAll, fetchDictionaries } = require('../../utils/planApi.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { consumeListRefreshOnShow, LIST_ROUTES } = require('../../utils/saveNavigation.js');

const HUB_LIST_ROUTE = LIST_ROUTES.PSI_PURCHASE_ORDERS.replace(/^\//, '');

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
    onlyShowUnsettled: false,
    draftOnlyShowUnsettled: false,
    showFilterPanel: false,
    filterActive: false,
    canViewFlow: false,
    canCreate: false,
    canViewAmount: false,
    emptyText: '暂无采购订单',
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
        url: `/pages/psi-purchase-order-detail/psi-purchase-order-detail?docNumber=${encodeURIComponent(docNumber)}`,
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
    if (!hasPermission(ctx.permissions || [], 'psi:purchase_order:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    this.setData({
      canViewFlow: hasPermission(ctx.permissions || [], 'psi:purchase_order:view'),
      canCreate: hasPermission(ctx.permissions || [], 'psi:purchase_order:create'),
      canViewAmount: hasPermission(ctx.permissions || [], 'psi:purchase_order:amount'),
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
    wx.navigateTo({ url: '/pages/psi-purchase-order-edit/psi-purchase-order-edit' });
  },

  onFlowTap() {
    wx.navigateTo({ url: '/pages/psi-purchase-order-flow/psi-purchase-order-flow' });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    this._filterOpenedAt = Date.now();
    this.setData({
      showFilterPanel: true,
      draftOnlyShowUnsettled: this.data.onlyShowUnsettled,
    });
  },

  closeFilterPanel() {
    this.setData({
      showFilterPanel: false,
      filterActive: this.data.onlyShowUnsettled,
    });
  },

  onUnsettledToggle() {
    const next = !this.data.draftOnlyShowUnsettled;
    this.setData({ draftOnlyShowUnsettled: next });
    this._draftOnlyShowUnsettled = next;
    this.setData({ onlyShowUnsettled: next, filterActive: next });
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
      url: `/pages/psi-purchase-order-detail/psi-purchase-order-detail?docNumber=${encodeURIComponent(docNumber)}`,
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
      const [purchaseOrders, purchaseBills, products, dictionaries] = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchAllPsiRecords(PSI_BILL_TYPE),
        fetchProductsAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
      ]);
      this._purchaseOrders = purchaseOrders || [];
      this._purchaseBills = purchaseBills || [];
      this._productMap = buildProductMap(products || []);
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      await this.reloadList();
    } catch (err) {
      this.setData({ loading: false, cards: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  buildFilteredCards() {
    const groups = groupRecordsByDocNumber(this._purchaseOrders || [], PSI_TYPE);
    const parsed = parsePurchaseOrderSearch(this.data.searchKeyword);
    const ctx = {
      receivedByOrderLine: sumReceivedByOrderLine(this._purchaseBills || []),
      productMap: this._productMap,
      dictionaries: this._dictionaries,
      showAmount: this.data.canViewAmount,
    };
    return buildPurchaseOrderListCards(
      groups,
      parsed.search,
      this.data.onlyShowUnsettled,
      ctx,
    ).map(slimPurchaseOrderListCard);
  },

  async reloadList() {
    if (!this._initialized || !this._purchaseOrders) {
      return this.bootstrap();
    }
    this.setData({ loading: true, page: 1 });
    try {
      const [purchaseOrders, purchaseBills] = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchAllPsiRecords(PSI_BILL_TYPE),
      ]);
      this._purchaseOrders = purchaseOrders || [];
      this._purchaseBills = purchaseBills || [];
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
      emptyText: allCards.length ? '' : (this.data.searchKeyword || this.data.onlyShowUnsettled
        ? '无匹配采购订单'
        : '暂无采购订单'),
      filterActive: this.data.onlyShowUnsettled,
    });
    return Promise.resolve();
  },
});
