const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =






  require('../../utils/orderApi.js'),fetchTenantConfig = _require3.fetchTenantConfig,fetchBomsAll = _require3.fetchBomsAll,fetchNodesAll = _require3.fetchNodesAll,fetchProductionRecords = _require3.fetchProductionRecords,listProductProgressAll = _require3.listProductProgressAll;
const { loadProductMetaMaps } = require('../../utils/productMetaMaps.js');
const _require4 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require4.fetchAllOrdersPaginated;
const _require5 = require('../../utils/productionPlans.js'),normalizeMasterList = _require5.normalizeMasterList;
const _require6 =










  require('../utils/materialStockPanel.js'),buildMaterialPanelCards = _require6.buildMaterialPanelCards,paginateCards = _require6.paginateCards,paginatePartnerGroups = _require6.paginatePartnerGroups,decorateCards = _require6.decorateCards,decoratePartnerGroups = _require6.decoratePartnerGroups,aggregateCardMaterialRows = _require6.aggregateCardMaterialRows,findCardInPartnerGroups = _require6.findCardInPartnerGroups,DEFAULT_PAGE_SIZE = _require6.DEFAULT_PAGE_SIZE,PARTNER_PAGE_SIZE = _require6.PARTNER_PAGE_SIZE,INTERNAL_PARTNER_KEY = _require6.INTERNAL_PARTNER_KEY,hasMaterialModuleAccess = _require6.hasMaterialModuleAccess;
const _require7 =


  require('../../utils/materialStatsLite.js'),getActiveOrderIdsCsv = _require7.getActiveOrderIdsCsv,getActiveSourceProductIdsCsv = _require7.getActiveSourceProductIdsCsv;
const _require8 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require8.readNavBarMetrics,readWindowMetrics = _require8.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../../utils/planFilterPanel.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
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
    listViewMode: 'order',
    flatMaterialRows: [],
    showFilterPanel: false,
    filterActive: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
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
    this._listViewMode = 'order';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canViewList: hasPermission(perms, 'production:material_list:allow'),
      canIssue: hasPermission(perms, 'production:material_issue:allow'),
      canReturn: hasPermission(perms, 'production:material_return:allow'),
      canViewFlow: hasPermission(perms, 'production:material_records:view')
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
      const { shouldHubListRefetch, LIST_ROUTES } = require('../../utils/saveNavigation.js');
      if (shouldHubListRefetch(this, LIST_ROUTES.STOCK_OUT, { skipWasHidden: true })) {
        this.bootstrap(false);
      } else {
        this.applyPagination();
      }
    }
  },

  onHide() {
    const { trackHubListHidden } = require('../../utils/saveNavigation.js');
    trackHubListHidden(this);
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

  computeFilterActive(showPanel) {
    if (showPanel) return true;
    return this.data.listViewMode === 'material';
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    markFilterPanelOpen(this);
    this.setData({
      showFilterPanel: true,
      filterActive: true,
    });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.setData({
      showFilterPanel: false,
      filterActive: this.computeFilterActive(false),
    });
  },

  onPageScroll() {
    if (!shouldCloseFilterPanelOnScroll(this)) return;
    this.closeFilterPanel();
  },

  onFlowTap() {
    if (!this.data.canViewFlow) return;
    this.closeFilterPanel();
    wx.navigateTo({ url: '/packageBusiness/production-stock-out-flow/production-stock-out-flow' });
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

  onListViewModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'order' && mode !== 'material') return;
    if (mode === this._listViewMode) return;
    this._listViewMode = mode;
    this._page = 1;
    this._selectState = { partnerKey: '', scopeKey: '', mode: '', selectedIds: new Set() };
    this.applyPagination();
    this.setData({
      filterActive: this.computeFilterActive(this.data.showFilterPanel),
    });
  },

  onStartSelectTap(e) {
    const _e$currentTarget$data = e.currentTarget.dataset,scopeKey = _e$currentTarget$data.scopeKey,mode = _e$currentTarget$data.mode,partnerKey = _e$currentTarget$data.partnerKey;
    if (mode === 'stock_out' && !this.data.canIssue) return;
    if (mode === 'stock_return' && !this.data.canReturn) return;
    this._selectState = {
      partnerKey: partnerKey || INTERNAL_PARTNER_KEY,
      scopeKey,
      mode,
      selectedIds: new Set()
    };
    this.applyPagination();
  },

  onCancelSelectTap() {
    this._selectState = { partnerKey: '', scopeKey: '', mode: '', selectedIds: new Set() };
    this.applyPagination();
  },

  onMaterialRowTap(e) {
    if (!this._selectState.mode) return;
    const _e$currentTarget$data2 = e.currentTarget.dataset,scopeKey = _e$currentTarget$data2.scopeKey,productId = _e$currentTarget$data2.productId,partnerKey = _e$currentTarget$data2.partnerKey;
    if (this._selectState.scopeKey !== scopeKey) return;
    if ((this._selectState.partnerKey || INTERNAL_PARTNER_KEY) !== (partnerKey || INTERNAL_PARTNER_KEY)) {
      return;
    }
    const ids = new Set(this._selectState.selectedIds);
    if (ids.has(productId)) ids.delete(productId);else
    ids.add(productId);
    this._selectState = { ...this._selectState, selectedIds: ids };
    this.applyPagination();
  },

  onConfirmSelectTap(e) {
    const _e$currentTarget$data3 = e.currentTarget.dataset,scopeKey = _e$currentTarget$data3.scopeKey,partnerKey = _e$currentTarget$data3.partnerKey;
    const card = this._groupByPartner ?
    findCardInPartnerGroups(this._allPartnerGroups, scopeKey, partnerKey) :
    (this._allCards || []).find((c) => c.scopeKey === scopeKey);
    if (!card || !this._selectState.selectedIds.size) {
      wx.showToast({ title: '请选择物料', icon: 'none' });
      return;
    }
    const selected = (card.materialRows || []).filter(
      (m) => this._selectState.selectedIds.has(m.productId)
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
          stockRecords: this._stockRecords || []
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
        url: `/packageBusiness/production-order-material/production-order-material?${q.join('&')}`
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
        stockRecords: this._stockRecords || []
      };
    }
    wx.navigateTo({
      url: `/packageBusiness/production-stock-out-confirm/production-stock-out-confirm?mode=${encodeURIComponent(this._selectState.mode)}`
    });
  },

  async bootstrap(showLoading) {
    if (this._bootstrapping) return;
    this._bootstrapping = true;
    if (showLoading !== false) {
      this.setData({ loading: true });
    }
    try {
      const [config, orders, productMeta, bomsRaw, nodesRaw, pmpRaw] = await Promise.all([
        fetchTenantConfig(),
        fetchAllOrdersPaginated({}),
        loadProductMetaMaps(),
        fetchBomsAll().catch(() => []),
        fetchNodesAll().catch(() => []),
        listProductProgressAll().catch(() => [])
      ]);

      const productionLinkMode = config && config.productionLinkMode || 'order';
      const materialPanelSettings = config && config.materialPanelSettings || {};
      const products = productMeta.products;
      const boms = Array.isArray(bomsRaw) ? bomsRaw : normalizeMasterList(bomsRaw);
      const globalNodes = Array.isArray(nodesRaw) ? nodesRaw : [];
      const productMilestoneProgresses = Array.isArray(pmpRaw) ? pmpRaw : [];
      this._categoryMap = productMeta.categoryMap;
      this._partnerNameById = productMeta.partnerNameById;

      const allOrders = orders || [];
      const orderIdsCsv = getActiveOrderIdsCsv(allOrders);
      const sourceProductIdsCsv = getActiveSourceProductIdsCsv(allOrders);

      let stockRecords = [];
      if (orderIdsCsv || sourceProductIdsCsv) {
        // all=true：与网页 fetchAllPages 对齐；默认分页只取首屏约 50 条会导致生产物料数量偏小
        const params = { types: 'STOCK_OUT,STOCK_RETURN,OUTSOURCE', all: 'true' };
        if (orderIdsCsv) params.orderIds = orderIdsCsv;
        if (sourceProductIdsCsv) params.sourceProductIds = sourceProductIdsCsv;
        const raw = await fetchProductionRecords(params);
        stockRecords = Array.isArray(raw) ? raw : raw && raw.data || [];
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
        emptyText: '加载失败'
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this._bootstrapping = false;
    }
  },

  rebuildCards() {
    const groupByPartner = !!(this._materialPanelSettings &&
    this._materialPanelSettings.groupByOutsourcePartner);
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
      categoryMap: this._categoryMap,
      partnerNameById: this._partnerNameById
    });
    this._groupByPartner = groupByPartner && result.groupByPartner;
    this._allCards = result.cards;
    this._allPartnerGroups = result.partnerGroups || [];
    this.applyPagination();
  },

  applyPagination() {
    const emptyText = this.data.searchKeyword ? '无匹配项' : '暂无物料数据';
    const listViewMode = this._listViewMode || 'order';
    if (this._groupByPartner) {
      const paginated = paginatePartnerGroups(this._allPartnerGroups, this._page, PARTNER_PAGE_SIZE);
      const partnerGroups = decoratePartnerGroups(paginated.rows, this._selectState, listViewMode);
      this.setData({
        loading: false,
        groupByPartner: true,
        listViewMode,
        flatMaterialRows: [],
        partnerGroups,
        cards: [],
        hasMore: paginated.hasMore,
        totalCards: paginated.total,
        emptyText
      });
      return;
    }
    if (listViewMode === 'material') {
      const flatMaterialRows = aggregateCardMaterialRows(this._allCards || []);
      this.setData({
        loading: false,
        groupByPartner: false,
        listViewMode: 'material',
        flatMaterialRows,
        partnerGroups: [],
        cards: [],
        hasMore: false,
        totalCards: flatMaterialRows.length,
        emptyText
      });
      return;
    }
    const paginated = paginateCards(this._allCards || [], this._page, DEFAULT_PAGE_SIZE);
    const cards = decorateCards(paginated.rows, this._selectState);
    this.setData({
      loading: false,
      groupByPartner: false,
      listViewMode: 'order',
      flatMaterialRows: [],
      partnerGroups: [],
      cards,
      hasMore: paginated.hasMore,
      totalCards: paginated.total,
      emptyText
    });
  }
});