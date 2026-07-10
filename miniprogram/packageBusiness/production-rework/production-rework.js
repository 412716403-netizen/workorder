const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission,filterByPermission = _require2.filterByPermission;
const _require3 = require('../config/productionRework.js'),REWORK_SHORTCUTS = _require3.REWORK_SHORTCUTS;
const _require4 =




  require('../utils/reworkPanelLite.js'),buildReworkStats = _require4.buildReworkStats,buildReworkListBlocks = _require4.buildReworkListBlocks,filterReworkBlocks = _require4.filterReworkBlocks,mapReworkCardForUi = _require4.mapReworkCardForUi;
const _require5 =


  require('../utils/reworkPendingLite.js'),buildReworkPendingRows = _require5.buildReworkPendingRows,countPendingRows = _require5.countPendingRows;
const _require6 = require('../utils/reworkRecordsLoad.js'),fetchReworkRecordsForPanel = _require6.fetchReworkRecordsForPanel;
const _require7 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require7.fetchAllOrdersPaginated;
const _require8 =




  require('../utils/orderApi.js'),fetchTenantConfig = _require8.fetchTenantConfig,fetchProductsAll = _require8.fetchProductsAll,fetchNodesAll = _require8.fetchNodesAll,listProductProgressAll = _require8.listProductProgressAll;
const _require9 = require('../utils/productionOrders.js'),normalizeMasterList = _require9.normalizeMasterList;
const _require0 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require0.readNavBarMetrics,readWindowMetrics = _require0.readWindowMetrics;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildFilterShortcuts(permissions, pendingCount) {
  return filterByPermission(REWORK_SHORTCUTS, permissions || []).map((item) => ({
    ...item,
    badgeText: item.id === 'pending' && pendingCount > 0 ? `(${pendingCount})` : ''
  }));
}

function mapChipsForScroll(chips, orderId) {
  return (chips || []).map((chip) => {
    const total = Number(chip.totalQty) || 0;
    const completed = Number(chip.completedQty) || 0;
    const pending = Number(chip.pendingQty) || 0;
    return {
      milestoneId: chip.chipKey || chip.nodeId,
      nodeId: chip.nodeId,
      orderId: orderId || '',
      name: chip.name || chip.label || '',
      partner: chip.outsourcePartner || '',
      completed,
      availableQty: total,
      remaining: pending,
      progress: total > 0 ? Math.round(completed / total * 100) : 0,
      isCompleted: chip.isCompleted,
      disabled: chip.disabled,
      outsourcePartner: chip.outsourcePartner || ''
    };
  });
}

function flattenReworkCards(blocks, ctx) {
  const cards = [];
  (blocks || []).forEach((block) => {
    const mapped = mapReworkCardForUi(block, ctx);
    if (mapped.blockType === 'parent') {
      const blockKey = mapped.cardKey;
      const expanded = !!ctx.expandedParents[blockKey];
      cards.push({
        ...mapped,
        rowKey: blockKey,
        depth: 0,
        hasChildren: true,
        expanded,
        blockKey,
        scrollChips: mapChipsForScroll(mapped.chips, mapped.orderId)
      });
      if (expanded && mapped.children && mapped.children.length) {
        mapped.children.forEach((child) => {
          cards.push({
            ...child,
            rowKey: child.cardKey,
            depth: 1,
            hasChildren: false,
            expanded: false,
            blockKey,
            scrollChips: mapChipsForScroll(child.chips, child.orderId)
          });
        });
      }
      return;
    }
    cards.push({
      ...mapped,
      rowKey: mapped.cardKey,
      depth: 0,
      hasChildren: false,
      expanded: false,
      blockKey: mapped.cardKey,
      scrollChips: mapChipsForScroll(mapped.chips, mapped.orderId)
    });
  });
  return cards;
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
    canDetail: false,
    canMaterial: false,
    canReport: false,
    emptyText: '暂无返工数据',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    const permissions = (ctx && ctx.permissions) || [];
    const { hasAnySubModulePerm } = require('../../utils/accessControl.js');
    const { WORKBENCH_SHORTCUT_CATALOG } = require('../../config/menus.js');
    const hub = WORKBENCH_SHORTCUT_CATALOG.find((i) => i.id === 'production-rework');
    if (!hasAnySubModulePerm(permissions, 'production', (hub && hub.permAnyOf) || [])) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const reworkOrderId = options.reworkOrderId ?
    decodeURIComponent(options.reworkOrderId) :
    '';
    if (reworkOrderId) {
      wx.redirectTo({
        url: `/packageBusiness/production-rework-detail/production-rework-detail?reworkOrderId=${encodeURIComponent(reworkOrderId)}`
      });
      return;
    }

    this._expandedParents = {};
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canViewList: hasPermission(permissions, 'production:rework_list:allow'),
      canDetail: hasPermission(permissions, 'production:rework_detail:allow'),
      canMaterial: hasPermission(permissions, 'production:rework_material:allow'),
      canReport: hasPermission(permissions, 'production:rework_report_records:create'),
      filterShortcuts: buildFilterShortcuts(permissions)
    });
  },

  onShow() {
    this.bootstrap();
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onProductImageError(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
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
      this.setData({
        showFilterPanel: false,
        filterActive: this.computeFilterActive(false)
      });
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

  onToggleExpand(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    if (this._expandedParents[key]) {
      delete this._expandedParents[key];
    } else {
      this._expandedParents[key] = true;
    }
    this.applyListFilter();
  },

  onChipTap(e) {
    if (!this.data.canReport) {
      wx.showToast({ title: '暂无返工报工权限', icon: 'none' });
      return;
    }
    const cardKey = e.currentTarget.dataset.cardKey;
    const milestoneId = e.detail && e.detail.milestoneId || '';
    const card = (this.data.cards || []).find((c) => c.rowKey === cardKey || c.cardKey === cardKey);
    if (!card) return;
    const chip = (card.chips || []).find(
      (c) => c.chipKey === milestoneId || c.nodeId === milestoneId
    );
    if (!chip || chip.disabled) return;
    const q = [
    `nodeId=${encodeURIComponent(chip.nodeId || '')}`];

    if (card.orderId) q.push(`orderId=${encodeURIComponent(card.orderId)}`);
    if (card.productId) q.push(`productId=${encodeURIComponent(card.productId)}`);
    if (chip.outsourcePartner) {
      q.push(`outsourcePartner=${encodeURIComponent(chip.outsourcePartner)}`);
    }
    wx.navigateTo({
      url: `/packageBusiness/production-rework-report/production-rework-report?${q.join('&')}`
    });
  },

  onDetailTap(e) {
    const reworkOrderId = e.currentTarget.dataset.reworkOrderId;
    if (!reworkOrderId) return;
    wx.navigateTo({
      url: `/packageBusiness/production-rework-detail/production-rework-detail?reworkOrderId=${encodeURIComponent(reworkOrderId)}`
    });
  },

  onMaterialTap(e) {
    const _e$currentTarget$data = e.currentTarget.dataset,orderId = _e$currentTarget$data.orderId,productId = _e$currentTarget$data.productId;
    if (this._productionLinkMode === 'product' && productId) {
      wx.navigateTo({
        url: `/packageBusiness/production-order-material/production-order-material?source=rework&productId=${encodeURIComponent(productId)}`
      });
      return;
    }
    if (!orderId) return;
    wx.navigateTo({
      url: `/packageBusiness/production-order-material/production-order-material?source=rework&orderId=${encodeURIComponent(orderId)}`
    });
  },

  applyListFilter() {
    if (!this._allBlocks || !this._reworkStats) return;
    const filtered = filterReworkBlocks(this._allBlocks, {
      searchKeyword: this.data.searchKeyword,
      onlyShowIncompleteOrders: this.data.onlyShowIncomplete,
      productionLinkMode: this._productionLinkMode,
      statsByOrderId: this._reworkStats.statsByOrderId,
      statsByProductId: this._reworkStats.statsByProductId,
      idx: this._reworkStats.idx
    });
    const cards = flattenReworkCards(filtered, {
      productionLinkMode: this._productionLinkMode,
      statsByOrderId: this._reworkStats.statsByOrderId,
      statsByProductId: this._reworkStats.statsByProductId,
      idx: this._reworkStats.idx,
      expandedParents: this._expandedParents || {},
      canReport: this.data.canReport,
      canDetail: this.data.canDetail,
      canMaterial: this.data.canMaterial
    });
    this.setData({
      cards,
      emptyText: filtered.length === 0 && this._allBlocks.length > 0 ?
      '无匹配项，请调整搜索' :
      '暂无返工数据'
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
      this._processSequenceMode = config.processSequenceMode || 'sequential';
      this._reworkFormSettings = config.reworkFormSettings || {};
      if (
      this._reworkFormSettings.onlyShowNotCompletedOrder === true &&
      !this._userToggledIncomplete)
      {
        this.setData({ onlyShowIncomplete: true });
      }

      const _await$Promise$all = await Promise.all([
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchNodesAll(),
        listProductProgressAll()]
        ),allOrders = _await$Promise$all[0],productsRaw = _await$Promise$all[1],nodesRaw = _await$Promise$all[2],pmpRaw = _await$Promise$all[3];

      this._products = normalizeMasterList(productsRaw);
      this._nodes = normalizeMasterList(nodesRaw);
      this._orders = allOrders || [];
      this._pmp = Array.isArray(pmpRaw) ? pmpRaw : pmpRaw && pmpRaw.data || [];

      const records = await fetchReworkRecordsForPanel({
        productionLinkMode: this._productionLinkMode,
        orders: this._orders,
        products: this._products
      });

      this._reworkStats = buildReworkStats({
        productionLinkMode: this._productionLinkMode,
        records: records || [],
        orders: this._orders,
        products: this._products,
        nodes: this._nodes,
        processSequenceMode: this._processSequenceMode
      });

      this._allBlocks = buildReworkListBlocks({
        productionLinkMode: this._productionLinkMode,
        orders: this._orders,
        statsByOrderId: this._reworkStats.statsByOrderId,
        statsByProductId: this._reworkStats.statsByProductId,
        idx: this._reworkStats.idx
      });

      const ctx = readTenantCtx();
      const pendingRows = buildReworkPendingRows({
        productionLinkMode: this._productionLinkMode,
        records: records || [],
        orders: this._orders,
        products: this._products,
        productMilestoneProgresses: this._pmp,
        nodes: this._nodes,
        onlyShowIncompleteOrders: this.data.onlyShowIncomplete
      });
      const pendingCount = countPendingRows(pendingRows);
      this.setData({
        filterShortcuts: buildFilterShortcuts(ctx && ctx.permissions || [], pendingCount),
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