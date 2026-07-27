const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =



  require('../config/purchaseOrders.js'),DEFAULT_PAGE_SIZE = _require3.DEFAULT_PAGE_SIZE,PSI_TYPE = _require3.PSI_TYPE,PSI_BILL_TYPE = _require3.PSI_BILL_TYPE;
const _require4 =




  require('../../utils/purchaseOrders.js'),parsePurchaseOrderSearch = _require4.parsePurchaseOrderSearch,buildPurchaseOrderListCards = _require4.buildPurchaseOrderListCards,slimPurchaseOrderListCard = _require4.slimPurchaseOrderListCard;
const _require5 = require('../../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require5.groupRecordsByDocNumber,sumReceivedByOrderLine = _require5.sumReceivedByOrderLine;
const _require6 = require('../../utils/psiApi.js'),fetchAllPsiRecords = _require6.fetchAllPsiRecords;
const _require7 = require('../../utils/planApi.js'),fetchDictionaries = _require7.fetchDictionaries;
const { loadProductMetaMaps } = require('../../utils/productMetaMaps.js');
const _require8 = require('../../utils/productionPlans.js'),normalizeAppDictionaries = _require8.normalizeAppDictionaries;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../../utils/planFilterPanel.js');
const _require0 = require('../../utils/saveNavigation.js'),shouldHubListRefetch = _require0.shouldHubListRefetch,trackHubListHidden = _require0.trackHubListHidden,LIST_ROUTES = _require0.LIST_ROUTES;

const HUB_LIST_ROUTE = LIST_ROUTES.PSI_PURCHASE_ORDERS.replace(/^\//, '');

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
        url: `/packagePsi/psi-purchase-order-detail/psi-purchase-order-detail?docNumber=${encodeURIComponent(docNumber)}`
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
      canViewAmount: hasPermission(ctx.permissions || [], 'psi:purchase_order:amount')
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
    wx.navigateTo({ url: '/packagePsi/psi-purchase-order-edit/psi-purchase-order-edit' });
  },

  onFlowTap() {
    wx.navigateTo({ url: '/packagePsi/psi-purchase-order-flow/psi-purchase-order-flow' });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    markFilterPanelOpen(this);
    this.setData({
      showFilterPanel: true,
      draftOnlyShowUnsettled: this.data.onlyShowUnsettled
    });
  },

  closeFilterPanel() {
    this.setData({
      showFilterPanel: false,
      filterActive: this.data.onlyShowUnsettled
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
      url: `/packagePsi/psi-purchase-order-detail/psi-purchase-order-detail?docNumber=${encodeURIComponent(docNumber)}`
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
      const [purchaseOrders, purchaseBills, productMeta, dictionaries] = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchAllPsiRecords(PSI_BILL_TYPE),
        loadProductMetaMaps(),
        fetchDictionaries().catch(() => ({}))
      ]);
      this._purchaseOrders = purchaseOrders || [];
      this._purchaseBills = purchaseBills || [];
      this._productMap = productMeta.productMap;
      this._categoryMap = productMeta.categoryMap;
      this._partnerNameById = productMeta.partnerNameById;
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
      categoryMap: this._categoryMap,
      partnerNameById: this._partnerNameById,
      dictionaries: this._dictionaries,
      showAmount: this.data.canViewAmount
    };
    return buildPurchaseOrderListCards(
      groups,
      parsed.search,
      this.data.onlyShowUnsettled,
      ctx
    ).map(slimPurchaseOrderListCard);
  },

  async reloadList() {
    if (!this._initialized || !this._purchaseOrders) {
      return this.bootstrap();
    }
    this.setData({ loading: true, page: 1 });
    try {
      const _await$Promise$all2 = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchAllPsiRecords(PSI_BILL_TYPE)]
        ),purchaseOrders = _await$Promise$all2[0],purchaseBills = _await$Promise$all2[1];
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
      emptyText: allCards.length ? '' : this.data.searchKeyword || this.data.onlyShowUnsettled ?
      '无匹配采购订单' :
      '暂无采购订单',
      filterActive: this.data.onlyShowUnsettled
    });
    return Promise.resolve();
  }
});