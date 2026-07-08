const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission,filterByPermission = _require2.filterByPermission;
const _require3 =

  require('../config/productionOutsource.js'),OUTSOURCE_SHORTCUTS = _require3.OUTSOURCE_SHORTCUTS;
const _require4 =




  require('../utils/outsourcePanelLite.js'),buildOutsourceStatsByOrder = _require4.buildOutsourceStatsByOrder,filterDisplayOutsourceStats = _require4.filterDisplayOutsourceStats,mapOutsourceCardForUi = _require4.mapOutsourceCardForUi,countPendingReceiveRows = _require4.countPendingReceiveRows;
const _require5 = require('../utils/outsourceReceiveAggregates.js'),buildOutsourceReceiveAggregates = _require5.buildOutsourceReceiveAggregates;
const _require6 =

  require('../utils/outsourceMaterialLite.js'),listOutsourceDispatchPartnersForCard = _require6.listOutsourceDispatchPartnersForCard;
const _require7 =


  require('../utils/outsourceRecordsLoad.js'),fetchOutsourceRecordsForPanel = _require7.fetchOutsourceRecordsForPanel,fetchStockRecordsForOutsourcePanel = _require7.fetchStockRecordsForOutsourcePanel;
const _require8 = require('../utils/planApi.js'),fetchPartnersAll = _require8.fetchPartnersAll;
const _require9 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require9.fetchAllOrdersPaginated;
const _require0 =




  require('../utils/orderApi.js'),fetchTenantConfig = _require0.fetchTenantConfig,fetchProductsAll = _require0.fetchProductsAll,fetchNodesAll = _require0.fetchNodesAll,fetchBomsAll = _require0.fetchBomsAll;
const _require1 = require('../utils/productionPlans.js'),normalizeMasterList = _require1.normalizeMasterList;
const _require10 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require10.readNavBarMetrics,readWindowMetrics = _require10.readWindowMetrics;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildFilterShortcuts(permissions, pendingCount) {
  return filterByPermission(OUTSOURCE_SHORTCUTS, permissions || []).map((item) => ({
    ...item,
    badgeText: item.id === 'receive' && pendingCount > 0 ? `(${pendingCount})` : ''
  }));
}

Page({
  data: {
    loading: true,
    cards: [],
    searchKeyword: '',
    showFilterPanel: false,
    filterActive: false,
    onlyShowIncomplete: false,
    draftOnlyShowIncomplete: false,
    filterShortcuts: [],
    canViewList: false,
    canMaterial: false,
    emptyText: '暂无委外数据',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission(ctx && ctx.permissions || [], 'production:outsource:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canViewList: hasPermission(ctx && ctx.permissions || [], 'production:outsource_list:allow'),
      canMaterial: hasPermission(ctx && ctx.permissions || [], 'production:outsource_material:allow')
    });
  },

  onShow() {
    this.bootstrap();
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  async ensureMaterialDeps() {
    if (this._materialDepsLoaded) return;
    const _await$Promise$all = await Promise.all([
      fetchStockRecordsForOutsourcePanel(this._orders || []),
      fetchBomsAll()]
      ),stockRaw = _await$Promise$all[0],bomsRaw = _await$Promise$all[1];
    this._stockRecords = stockRaw || [];
    this._boms = normalizeMasterList(bomsRaw);
    this._materialDepsLoaded = true;
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onProductImageError(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || !this._allStats) return;
    const cards = (this.data.cards || []).map((c) =>
    c.cardKey === key ? { ...c, showProductImage: false } : c
    );
    this.setData({ cards });
  },

  onSearchInput(e) {
    this._searchKeyword = e.detail.value || '';
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.setData({ searchKeyword: this._searchKeyword });
      this.applyListFilter();
    }, 350);
  },

  onSearchClear() {
    this._searchKeyword = '';
    this.setData({ searchKeyword: '' });
    this.applyListFilter();
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.setData({ showFilterPanel: false, filterActive: this.computeFilterActive(false) });
      return;
    }
    this.setData({
      showFilterPanel: true,
      draftOnlyShowIncomplete: this.data.onlyShowIncomplete,
      filterActive: true
    });
  },

  onExcludeToggle() {
    this._userToggledIncomplete = true;
    this.setData({ draftOnlyShowIncomplete: !this.data.draftOnlyShowIncomplete });
  },

  onFilterReset() {
    this.setData({ draftOnlyShowIncomplete: false });
  },

  onFilterApply() {
    this._userToggledIncomplete = true;
    this.setData({
      onlyShowIncomplete: this.data.draftOnlyShowIncomplete,
      showFilterPanel: false,
      filterActive: this.computeFilterActive(false, this.data.draftOnlyShowIncomplete)
    });
    this.bootstrap();
  },

  computeFilterActive(showPanel, onlyIncomplete) {
    if (showPanel) return true;
    if (onlyIncomplete != null ? onlyIncomplete : this.data.onlyShowIncomplete) return true;
    return false;
  },

  onShortcutTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this.data.filterShortcuts || []).find((s) => s.id === id);
    if (!item || !item.path) return;
    this.setData({ showFilterPanel: false });
    wx.navigateTo({ url: item.path });
  },

  onPartnerDetailTap(e) {
    this.navigatePartnerDetail(e.currentTarget.dataset);
  },

  onPartnerChipTap(e) {
    this.navigatePartnerDetail(e.currentTarget.dataset);
  },

  navigatePartnerDetail(d) {
    const q = [
    `productId=${encodeURIComponent(d.productId || '')}`,
    `nodeId=${encodeURIComponent(d.nodeId || '')}`,
    `partner=${encodeURIComponent(d.partner || '')}`,
    `nodeName=${encodeURIComponent(d.nodeName || '')}`,
    `productName=${encodeURIComponent(d.productName || '')}`,
    `orderNumber=${encodeURIComponent(d.orderNumber || '')}`];

    if (d.orderId) q.push(`orderId=${encodeURIComponent(d.orderId)}`);
    wx.navigateTo({
      url: `/packageBusiness/production-outsource-partner-detail/production-outsource-partner-detail?${q.join('&')}`
    });
  },

  onMaterialDispatchTap(e) {
    this.openMaterialConfirm(e, 'stock_out');
  },

  onMaterialReturnTap(e) {
    this.openMaterialConfirm(e, 'stock_return');
  },

  openMaterialConfirm(e, mode) {
    this.ensureMaterialDeps().then(() => {
      this.openMaterialConfirmAfterDeps(e, mode);
    }).catch(() => {
      wx.showToast({ title: '加载物料数据失败', icon: 'none' });
    });
  },

  openMaterialConfirmAfterDeps(e, mode) {
    const d = e.currentTarget.dataset;
    let partners = [];
    try {
      partners = JSON.parse(d.partners || '[]');
    } catch {
      partners = [];
    }
    if (mode === 'stock_return') {
      const stockRecords = this._stockRecords || [];
      const scope = { orderId: d.orderId, productId: d.productId };
      const dispatchPartners = listOutsourceDispatchPartnersForCard(
        stockRecords,
        scope,
        this._productionLinkMode
      );
      if (!dispatchPartners.length) {
        wx.showToast({ title: '暂无领料记录，无法退料', icon: 'none' });
        return;
      }
      partners = dispatchPartners;
    }
    if (!partners.length && mode === 'stock_out') {
      this.pickPartnerThenMaterial(d, mode);
      return;
    }
    this.navigateMaterialConfirm(d, mode, partners[0] || '');
  },

  async pickPartnerThenMaterial(d, mode) {
    try {
      const partnersRaw = await fetchPartnersAll();
      const names = (partnersRaw || []).map((p) => p.name).filter(Boolean);
      if (!names.length) {
        wx.showToast({ title: '请先在基础档案添加合作单位', icon: 'none' });
        return;
      }
      wx.showActionSheet({
        itemList: names.slice(0, 6),
        success: (res) => {
          const partnerKey = names[res.tapIndex] || '';
          this.navigateMaterialConfirm(d, mode, partnerKey);
        }
      });
    } catch {
      wx.showToast({ title: '加载加工厂失败', icon: 'none' });
    }
  },

  navigateMaterialConfirm(d, mode, partnerKey) {
    if (mode === 'stock_out') {
      const q = ['source=outsource'];
      if (d.orderId) {
        q.push(`orderId=${encodeURIComponent(d.orderId)}`);
      } else if (d.productId) {
        q.push(`productId=${encodeURIComponent(d.productId)}`);
      }
      if (partnerKey) q.push(`partner=${encodeURIComponent(partnerKey)}`);
      wx.navigateTo({
        url: `/packageBusiness/production-order-material/production-order-material?${q.join('&')}`
      });
      return;
    }

    const q = ['source=outsource', 'mode=return'];
    if (d.orderId) {
      q.push(`orderId=${encodeURIComponent(d.orderId)}`);
    } else if (d.productId) {
      q.push(`productId=${encodeURIComponent(d.productId)}`);
    }
    if (partnerKey) q.push(`partner=${encodeURIComponent(partnerKey)}`);
    wx.navigateTo({
      url: `/packageBusiness/production-order-material/production-order-material?${q.join('&')}`
    });
  },

  applyListFilter() {
    if (!this._allStats) return;
    const ordersById = new Map((this._orders || []).map((o) => [o.id, o]));
    const settings = this._outsourceFormSettings || {};
    const filtered = filterDisplayOutsourceStats(this._allStats, {
      searchKeyword: this.data.searchKeyword,
      productionLinkMode: this._productionLinkMode,
      hideZeroPendingPartnerOnList: settings.hideZeroPendingPartnerOnList === true,
      onlyShowIncompleteOrders: this.data.onlyShowIncomplete,
      ordersById
    });
    const cards = filtered.map((item) => {
      const card = mapOutsourceCardForUi(item, this._productionLinkMode);
      return {
        ...card,
        uniquePartnersJson: JSON.stringify(card.uniquePartners || [])
      };
    });
    this.setData({
      cards,
      emptyText: filtered.length === 0 && this._allStats.length > 0 ?
      '无匹配项，请调整搜索' :
      settings.hideZeroPendingPartnerOnList ? '暂无待收回外协' : '暂无委外数据'
    });
  },

  async bootstrap() {
    if (!this.data.canViewList) {
      this.setData({ loading: false, cards: [] });
      return;
    }
    this.setData({ loading: true });
    try {
      const config = await fetchTenantConfig();
      this._productionLinkMode = config.productionLinkMode || 'order';
      this._outsourceFormSettings = config.outsourceFormSettings || {};
      if (this._outsourceFormSettings.onlyShowNotCompletedOrder === true && !this._userToggledIncomplete) {
        this.setData({ onlyShowIncomplete: true });
      }

      const _await$Promise$all2 = await Promise.all([
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchNodesAll()]
        ),allOrders = _await$Promise$all2[0],productsRaw = _await$Promise$all2[1],nodesRaw = _await$Promise$all2[2];

      this._products = normalizeMasterList(productsRaw);
      this._nodes = normalizeMasterList(nodesRaw);
      this._boms = [];
      this._stockRecords = [];
      this._materialDepsLoaded = false;
      this._orders = allOrders || [];

      const outsourceRaw = await fetchOutsourceRecordsForPanel({
        productionLinkMode: this._productionLinkMode,
        orders: this._orders,
        products: this._products
      });

      const ordersById = new Map(this._orders.map((o) => [o.id, o]));
      const productsById = new Map(this._products.map((p) => [p.id, p]));
      const nodesById = new Map(this._nodes.map((n) => [n.id, n]));
      const receiveRows = buildOutsourceReceiveAggregates(
        (outsourceRaw || []).filter((r) => r.type === 'OUTSOURCE'),
        ordersById,
        productsById,
        nodesById
      );
      const pendingCount = countPendingReceiveRows(receiveRows);
      const ctx = readTenantCtx();
      const shortcuts = buildFilterShortcuts(ctx && ctx.permissions || [], pendingCount);

      this._allStats = buildOutsourceStatsByOrder({
        productionLinkMode: this._productionLinkMode,
        records: outsourceRaw || [],
        orders: this._orders,
        products: this._products,
        nodes: this._nodes
      });

      this.setData({
        filterShortcuts: shortcuts,
        filterActive: this.computeFilterActive(this.data.showFilterPanel),
        loading: false
      });
      this.applyListFilter();
    } catch (err) {
      this.setData({ loading: false });
      if (err && err.statusCode === 401) return;
      wx.showToast({
        title: err && err.message || '加载失败',
        icon: 'none',
        duration: 2500
      });
    }
  }
});