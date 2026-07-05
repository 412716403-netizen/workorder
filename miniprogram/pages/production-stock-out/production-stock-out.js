const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  fetchTenantConfig,
  fetchProductsAll,
  fetchBomsAll,
  fetchNodesAll,
  fetchProductionRecords,
  listProductProgressAll,
} = require('../../utils/orderApi.js');
const { fetchAllOrdersPaginated } = require('../../utils/pendingStockBadge.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');
const {
  buildMaterialPanelCards,
  paginateCards,
  paginatePartnerGroups,
  decorateCards,
  decoratePartnerGroups,
  findCardInPartnerGroups,
  DEFAULT_PAGE_SIZE,
  PARTNER_PAGE_SIZE,
  INTERNAL_PARTNER_KEY,
  hasMaterialModuleAccess,
} = require('../../utils/materialStockPanel.js');
const {
  getActiveOrderIdsCsv,
  getActiveSourceProductIdsCsv,
} = require('../../utils/materialStatsLite.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    cards: [],
    partnerGroups: [],
    groupByPartner: false,
    searchKeyword: '',
    emptyText: '暂无物料数据',
    canViewList: false,
    canIssue: false,
    canReturn: false,
    canViewFlow: false,
    hasMore: false,
    totalCards: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    const perms = ctx.permissions || [];
    if (!hasMaterialModuleAccess(perms)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._page = 1;
    this._selectState = { partnerKey: '', scopeKey: '', mode: '', selectedIds: new Set() };
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canViewList: hasPermission(perms, 'production:material_list:allow'),
      canIssue: hasPermission(perms, 'production:material_issue:allow'),
      canReturn: hasPermission(perms, 'production:material_return:allow'),
      canViewFlow: hasPermission(perms, 'production:material_records:view'),
    });
    this.bootstrap(true);
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) return;
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) return;
    if (this._loadedOnce && !this._bootstrapping) {
      this._selectState = { partnerKey: '', scopeKey: '', mode: '', selectedIds: new Set() };
      this._page = 1;
      this.bootstrap(false);
    }
  },

  onPullDownRefresh() {
    this._page = 1;
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    this._page += 1;
    this.applyPagination();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onFlowTap() {
    if (!this.data.canViewFlow) return;
    wx.navigateTo({ url: '/pages/production-stock-out-flow/production-stock-out-flow' });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this._page = 1;
      this.rebuildCards();
    }, 300);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this._page = 1;
    this.rebuildCards();
  },

  onStartSelectTap(e) {
    const { scopeKey, mode, partnerKey } = e.currentTarget.dataset;
    if (mode === 'stock_out' && !this.data.canIssue) return;
    if (mode === 'stock_return' && !this.data.canReturn) return;
    this._selectState = {
      partnerKey: partnerKey || INTERNAL_PARTNER_KEY,
      scopeKey,
      mode,
      selectedIds: new Set(),
    };
    this.applyPagination();
  },

  onCancelSelectTap() {
    this._selectState = { partnerKey: '', scopeKey: '', mode: '', selectedIds: new Set() };
    this.applyPagination();
  },

  onMaterialRowTap(e) {
    if (!this._selectState.mode) return;
    const { scopeKey, productId, partnerKey } = e.currentTarget.dataset;
    if (this._selectState.scopeKey !== scopeKey) return;
    if ((this._selectState.partnerKey || INTERNAL_PARTNER_KEY) !== (partnerKey || INTERNAL_PARTNER_KEY)) {
      return;
    }
    const ids = new Set(this._selectState.selectedIds);
    if (ids.has(productId)) ids.delete(productId);
    else ids.add(productId);
    this._selectState = { ...this._selectState, selectedIds: ids };
    this.applyPagination();
  },

  onConfirmSelectTap(e) {
    const { scopeKey, partnerKey } = e.currentTarget.dataset;
    const card = this._groupByPartner
      ? findCardInPartnerGroups(this._allPartnerGroups, scopeKey, partnerKey)
      : (this._allCards || []).find((c) => c.scopeKey === scopeKey);
    if (!card || !this._selectState.selectedIds.size) {
      wx.showToast({ title: '请选择物料', icon: 'none' });
      return;
    }
    const selected = (card.materialRows || []).filter(
      (m) => this._selectState.selectedIds.has(m.productId),
    );
    if (!selected.length) {
      wx.showToast({ title: '请选择物料', icon: 'none' });
      return;
    }
    const pk = card.partnerKey || INTERNAL_PARTNER_KEY;

    if (this._selectState.mode === 'stock_return') {
      const app = getApp();
      if (app.globalData) {
        app.globalData.materialReturnPrefill = {
          partnerKey: pk,
          partnerLabel: pk === INTERNAL_PARTNER_KEY ? '本厂' : pk,
          orderId: card.orderId || '',
          sourceProductId: card.sourceProductId || '',
          orderNumber: card.orderNumber || '',
          productName: card.productName || '',
          selectedProductIds: Array.from(this._selectState.selectedIds),
          materialRows: card.materialRows || [],
          products: this._products || [],
          orders: this._orders || [],
          stockRecords: this._stockRecords || [],
        };
      }
      const q = ['mode=return', 'source=material_center'];
      if (card.orderId) {
        q.push(`orderId=${encodeURIComponent(card.orderId)}`);
      } else if (card.sourceProductId) {
        q.push(`productId=${encodeURIComponent(card.sourceProductId)}`);
      }
      if (pk !== INTERNAL_PARTNER_KEY) {
        q.push(`partner=${encodeURIComponent(pk)}`);
      }
      wx.navigateTo({
        url: `/pages/production-order-material/production-order-material?${q.join('&')}`,
      });
      return;
    }

    const app = getApp();
    if (app.globalData) {
      app.globalData.materialStockConfirm = {
        mode: this._selectState.mode,
        partnerKey: pk,
        partnerLabel: pk === INTERNAL_PARTNER_KEY ? '本厂' : pk,
        scopeKey: card.scopeKey,
        scopeType: card.scopeType,
        orderId: card.orderId || '',
        sourceProductId: card.sourceProductId || '',
        orderNumber: card.orderNumber || '',
        productName: card.productName || '',
        materials: selected,
        products: this._products || [],
        orders: this._orders || [],
        stockRecords: this._stockRecords || [],
      };
    }
    wx.navigateTo({
      url: `/pages/production-stock-out-confirm/production-stock-out-confirm?mode=${encodeURIComponent(this._selectState.mode)}`,
    });
  },

  async bootstrap(showLoading) {
    if (this._bootstrapping) return;
    this._bootstrapping = true;
    if (showLoading !== false) {
      this.setData({ loading: true });
    }
    try {
      const [config, orders, productsRaw, bomsRaw, nodesRaw, pmpRaw] = await Promise.all([
        fetchTenantConfig(),
        fetchAllOrdersPaginated({}),
        fetchProductsAll().catch(() => []),
        fetchBomsAll().catch(() => []),
        fetchNodesAll().catch(() => []),
        listProductProgressAll().catch(() => []),
      ]);

      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const materialPanelSettings = (config && config.materialPanelSettings) || {};
      const products = normalizeMasterList(productsRaw);
      const boms = Array.isArray(bomsRaw) ? bomsRaw : normalizeMasterList(bomsRaw);
      const globalNodes = Array.isArray(nodesRaw) ? nodesRaw : [];
      const productMilestoneProgresses = Array.isArray(pmpRaw) ? pmpRaw : [];

      const allOrders = orders || [];
      const orderIdsCsv = getActiveOrderIdsCsv(allOrders);
      const sourceProductIdsCsv = getActiveSourceProductIdsCsv(allOrders);

      let stockRecords = [];
      if (orderIdsCsv || sourceProductIdsCsv) {
        const params = { types: 'STOCK_OUT,STOCK_RETURN,OUTSOURCE' };
        if (orderIdsCsv) params.orderIds = orderIdsCsv;
        if (sourceProductIdsCsv) params.sourceProductIds = sourceProductIdsCsv;
        const raw = await fetchProductionRecords(params);
        stockRecords = Array.isArray(raw) ? raw : (raw && raw.data) || [];
      }

      this._productionLinkMode = productionLinkMode;
      this._materialPanelSettings = materialPanelSettings;
      this._orders = allOrders;
      this._products = products;
      this._boms = boms;
      this._stockRecords = stockRecords;
      this._globalNodes = globalNodes;
      this._productMilestoneProgresses = productMilestoneProgresses;

      this.rebuildCards();
      this._loadedOnce = true;
    } catch {
      this._allCards = [];
      this._allPartnerGroups = [];
      this._groupByPartner = false;
      this.setData({
        loading: false,
        cards: [],
        partnerGroups: [],
        groupByPartner: false,
        emptyText: '加载失败',
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this._bootstrapping = false;
    }
  },

  rebuildCards() {
    const groupByPartner = !!(this._materialPanelSettings
      && this._materialPanelSettings.groupByOutsourcePartner);
    const result = buildMaterialPanelCards({
      orders: this._orders || [],
      products: this._products || [],
      boms: this._boms || [],
      stockRecords: this._stockRecords || [],
      outsourceRecords: this._stockRecords || [],
      globalNodes: this._globalNodes || [],
      productMilestoneProgresses: this._productMilestoneProgresses || [],
      productionLinkMode: this._productionLinkMode || 'order',
      materialPanelSettings: this._materialPanelSettings || {},
      searchKeyword: this.data.searchKeyword,
      materialKw: '',
    });
    this._groupByPartner = groupByPartner && result.groupByPartner;
    this._allCards = result.cards;
    this._allPartnerGroups = result.partnerGroups || [];
    this.applyPagination();
  },

  applyPagination() {
    const emptyText = this.data.searchKeyword ? '无匹配项' : '暂无物料数据';
    if (this._groupByPartner) {
      const paginated = paginatePartnerGroups(this._allPartnerGroups, this._page, PARTNER_PAGE_SIZE);
      const partnerGroups = decoratePartnerGroups(paginated.rows, this._selectState);
      this.setData({
        loading: false,
        groupByPartner: true,
        partnerGroups,
        cards: [],
        hasMore: paginated.hasMore,
        totalCards: paginated.total,
        emptyText,
      });
      return;
    }
    const paginated = paginateCards(this._allCards || [], this._page, DEFAULT_PAGE_SIZE);
    const cards = decorateCards(paginated.rows, this._selectState);
    this.setData({
      loading: false,
      groupByPartner: false,
      partnerGroups: [],
      cards,
      hasMore: paginated.hasMore,
      totalCards: paginated.total,
      emptyText,
    });
  },
});
