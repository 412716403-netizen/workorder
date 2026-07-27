const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission,hasDocViewPermission = _require2.hasDocViewPermission;
const _require3 = require('../config/salesBills.js'),DEFAULT_PAGE_SIZE = _require3.DEFAULT_PAGE_SIZE,PSI_TYPE = _require3.PSI_TYPE;
const _require4 =



  require('../utils/salesBills.js'),parseSalesBillSearch = _require4.parseSalesBillSearch,buildSalesBillListCards = _require4.buildSalesBillListCards,slimSalesBillListCard = _require4.slimSalesBillListCard;
const _require5 = require('../../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require5.groupRecordsByDocNumber;
const _require6 = require('../../utils/psiApi.js'),fetchAllPsiRecords = _require6.fetchAllPsiRecords;
const _require7 = require('../../utils/planApi.js'),fetchDictionaries = _require7.fetchDictionaries;
const _require8 = require('../../utils/orderApi.js'),fetchWarehousesAll = _require8.fetchWarehousesAll;
const { loadProductMetaMaps } = require('../../utils/productMetaMaps.js');
const _require0 = require('../../utils/productionPlans.js'),normalizeAppDictionaries = _require0.normalizeAppDictionaries;
const _require1 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require1.readNavBarMetrics,readWindowMetrics = _require1.readWindowMetrics;
const _require10 = require('../../utils/saveNavigation.js'),shouldHubListRefetch = _require10.shouldHubListRefetch,trackHubListHidden = _require10.trackHubListHidden,LIST_ROUTES = _require10.LIST_ROUTES;

const HUB_LIST_ROUTE = LIST_ROUTES.PSI_SALES_BILLS.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildWarehouseMap(warehouses) {
  const map = new Map();
  (warehouses || []).forEach((w) => {
    if (w && w.id) map.set(w.id, w);
  });
  return map;
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    cards: [],
    searchKeyword: '',
    canViewFlow: false,
    canCreate: false,
    canViewAmount: false,
    emptyText: '暂无销售单',
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
        url: `/packagePsi/psi-sales-bill-detail/psi-sales-bill-detail?docNumber=${encodeURIComponent(docNumber)}`
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
    if (!hasDocViewPermission(ctx.permissions || [], 'psi:sales_bill:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      canViewFlow: hasDocViewPermission(ctx.permissions || [], 'psi:sales_bill:view'),
      canCreate: hasPermission(ctx.permissions || [], 'psi:sales_bill:create'),
      canViewAmount: hasPermission(ctx.permissions || [], 'psi:sales_bill:amount')
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
    wx.navigateTo({ url: '/packagePsi/psi-sales-bill-edit/psi-sales-bill-edit' });
  },

  onFlowTap() {
    wx.navigateTo({ url: '/packagePsi/psi-sales-bill-flow/psi-sales-bill-flow' });
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
      url: `/packagePsi/psi-sales-bill-detail/psi-sales-bill-detail?docNumber=${encodeURIComponent(docNumber)}`
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
      const [salesBills, productMeta, dictionaries, warehouses] = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        loadProductMetaMaps(),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => [])
      ]);
      this._salesBills = salesBills || [];
      this._productMap = productMeta.productMap;
      this._categoryMap = productMeta.categoryMap;
      this._partnerNameById = productMeta.partnerNameById;
      this._warehouseMap = buildWarehouseMap(Array.isArray(warehouses) ? warehouses : warehouses.data || []);
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      await this.reloadList();
    } catch (err) {
      this.setData({ loading: false, cards: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  buildFilteredCards() {
    const groups = groupRecordsByDocNumber(this._salesBills || [], PSI_TYPE);
    const parsed = parseSalesBillSearch(this.data.searchKeyword);
    const ctx = {
      productMap: this._productMap,
      categoryMap: this._categoryMap,
      partnerNameById: this._partnerNameById,
      warehouseMap: this._warehouseMap,
      dictionaries: this._dictionaries,
      showAmount: this.data.canViewAmount
    };
    return buildSalesBillListCards(groups, parsed.search, ctx).map(slimSalesBillListCard);
  },

  async reloadList() {
    if (!this._initialized || !this._salesBills) {
      return this.bootstrap();
    }
    this.setData({ loading: true, page: 1 });
    try {
      this._salesBills = await fetchAllPsiRecords(PSI_TYPE);
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
      emptyText: allCards.length ? '' : this.data.searchKeyword ? '无匹配销售单' : '暂无销售单'
    });
    return Promise.resolve();
  }
});