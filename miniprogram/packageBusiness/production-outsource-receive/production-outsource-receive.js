const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../../utils/planFilterPanel.js');
const _require3 = require('../utils/outsourceReceiveAggregates.js'),buildOutsourceReceiveAggregates = _require3.buildOutsourceReceiveAggregates;
const _require4 = require('../utils/outsourceReceiveKeys.js'),outsourceReceiveBaseKey = _require4.outsourceReceiveBaseKey;
const _require5 = require('../utils/outsourceDispatchLite.js'),buildDispatchMilestoneOptions = _require5.buildDispatchMilestoneOptions;
const _require1 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require1.fetchAllOrdersPaginated;
const _require10 = require('../utils/outsourceRecordsLoad.js'),fetchOutsourceRecordsForPanel = _require10.fetchOutsourceRecordsForPanel;
const _require11 =





  require('../../utils/orderApi.js'),fetchTenantConfig = _require11.fetchTenantConfig,fetchProductsAll = _require11.fetchProductsAll,fetchNodesAll = _require11.fetchNodesAll,fetchCategoriesAll = _require11.fetchCategoriesAll,listProductProgressAll = _require11.listProductProgressAll;
const _require12 = require('../../utils/productionPlans.js'),normalizeMasterList = _require12.normalizeMasterList;
const _require13 = require('../../utils/listProductThumb.js'),listProductThumbFromProduct = _require13.listProductThumbFromProduct;
const _require15 = require('../../utils/featurePlugins.js'),loadTraceabilityScanEnabled = _require15.loadTraceabilityScanEnabled;
const _require16 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require16.readNavBarMetrics,readWindowMetrics = _require16.readWindowMetrics;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function computeFilterActive(data) {
  if (data.showFilterPanel) return true;
  if (data.milestoneNodeId) return true;
  return false;
}

function milestoneOptionAt(options, index) {
  const list = options || [{ id: '', name: '全部工序' }];
  return list[index] || list[0] || { id: '', name: '全部工序' };
}

function mapReceiveRow(row, selectedKeys, productsById, productionLinkMode) {
  const rowKey = outsourceReceiveBaseKey(row);
  const product = productsById && row.productId ? productsById.get(row.productId) : null;
  const thumb = listProductThumbFromProduct(product);
  const partnerLabel = (row.partner || '').trim() || '—';
  const subtitleLine = productionLinkMode === 'product' ?
  row.productName || '—' :
  `${row.orderNumber || '—'} · ${row.productName || '—'}`;
  const pending = Number(row.pending) || 0;
  const dispatched = Number(row.dispatched) || 0;
  const received = Number(row.received) || 0;

  return {
    ...row,
    ...thumb,
    rowKey,
    selected: selectedKeys.has(rowKey),
    subtitleLine,
    partner: partnerLabel,
    showPartner: partnerLabel !== '—',
    milestoneName: row.milestoneName || '—',
    pendingQtyText: String(pending),
    statsLine: `已派 ${dispatched} / 已收 ${received}`,
    showStatsLine: dispatched > 0 || received > 0
  };
}

function filterReceiveRows(rows, keyword, filterOptions) {
  const milestoneNodeId = filterOptions && filterOptions.milestoneNodeId || '';
  let list = rows || [];
  if (milestoneNodeId) {
    list = list.filter((row) => row.nodeId === milestoneNodeId);
  }
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((row) => {
    const parts = [row.orderNumber, row.productName, row.partner, row.milestoneName];
    return parts.join(' ').toLowerCase().includes(q);
  });
}

Page({
  data: {
    loading: true,
    rows: [],
    searchKeyword: '',
    selectedCount: 0,
    canScan: false,
    showFilterPanel: false,
    filterActive: false,
    milestoneOptions: [{ id: '', name: '全部工序' }],
    milestoneNodeId: '',
    milestoneFilterIndex: 0,
    milestoneFilterLabel: '全部工序',
    draftMilestoneFilterIndex: 0,
    draftMilestoneFilterLabel: '全部工序',
    emptyText: '暂无待收回外协',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission(ctx && ctx.permissions || [], 'production:outsource_receive:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._selectedKeys = new Set();
    const canReceive = hasPermission(ctx && ctx.permissions || [], 'production:outsource_receive:allow');
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canScan: false,
    });
    loadTraceabilityScanEnabled().then((traceOn) => {
      this.setData({ canScan: canReceive && traceOn });
    });
    this.bootstrap();
  },

  onShow() {
    if (this._loadedOnce && !this._bootstrapping) {
      this._selectedKeys = new Set();
      this.setData({ selectedCount: 0 });
      const { shouldHubListRefetch, LIST_ROUTES } = require('../../utils/saveNavigation.js');
      if (shouldHubListRefetch(this, LIST_ROUTES.OUTSOURCE_RECEIVE, { skipWasHidden: true })) {
        this.bootstrap();
      } else {
        this.applyRows();
      }
    }
  },

  onHide() {
    const { trackHubListHidden } = require('../../utils/saveNavigation.js');
    trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onPageScroll() {
    if (!shouldCloseFilterPanelOnScroll(this)) return;
    if (this.data.showFilterPanel) {
      this.patchFilterActive({ showFilterPanel: false });
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  patchFilterActive(extra) {
    this.setData({
      ...extra,
      filterActive: computeFilterActive({ ...this.data, ...extra })
    });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.patchFilterActive({ showFilterPanel: false });
      return;
    }
    markFilterPanelOpen(this);
    this.patchFilterActive({
      showFilterPanel: true,
      draftMilestoneFilterIndex: this.data.milestoneFilterIndex,
      draftMilestoneFilterLabel: this.data.milestoneFilterLabel
    });
  },

  onDraftMilestoneChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = milestoneOptionAt(this.data.milestoneOptions, idx);
    this.setData({
      draftMilestoneFilterIndex: idx,
      draftMilestoneFilterLabel: opt.name || '全部工序'
    });
  },

  onFilterReset() {
    this.patchFilterActive({
      milestoneNodeId: '',
      milestoneFilterIndex: 0,
      milestoneFilterLabel: '全部工序',
      draftMilestoneFilterIndex: 0,
      draftMilestoneFilterLabel: '全部工序',
      showFilterPanel: false,
      searchKeyword: ''
    });
    this.applyRows();
  },

  onFilterApply() {
    const idx = Number(this.data.draftMilestoneFilterIndex) || 0;
    const opt = milestoneOptionAt(this.data.milestoneOptions, idx);
    this.patchFilterActive({
      milestoneNodeId: opt.id || '',
      milestoneFilterIndex: idx,
      milestoneFilterLabel: opt.name || '全部工序',
      showFilterPanel: false
    });
    this.applyRows();
  },

  syncMilestoneOptions() {
    const milestoneOptions = buildDispatchMilestoneOptions(this._allRows || [], this._nodes || []);
    let milestoneFilterIndex = this.data.milestoneFilterIndex || 0;
    if (milestoneFilterIndex >= milestoneOptions.length) milestoneFilterIndex = 0;
    const milestoneOpt = milestoneOptionAt(milestoneOptions, milestoneFilterIndex);
    this.patchFilterActive({
      milestoneOptions,
      milestoneFilterIndex,
      milestoneNodeId: milestoneOpt.id || '',
      milestoneFilterLabel: milestoneOpt.name || '全部工序'
    });
  },

  onScanTap() {
    wx.navigateTo({
      url: '/packageBusiness/production-outsource-receive-scan/production-outsource-receive-scan',
    });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    this.applyRows();
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyRows();
  },

  onProductImageError(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const rows = (this.data.rows || []).map((row) =>
    row.rowKey === key ? { ...row, showProductImage: false } : row
    );
    this.setData({ rows });
  },

  onRowTap(e) {
    const key = e.currentTarget.dataset.key;
    if (this._selectedKeys.has(key)) this._selectedKeys.delete(key);else
    this._selectedKeys.add(key);
    this.applyRows();
  },

  onConfirmTap() {
    if (!this._selectedKeys.size) return;
    const selected = (this._allRows || []).filter((r) => this._selectedKeys.has(outsourceReceiveBaseKey(r)));
    const partners = new Set(selected.map((r) => r.partner || ''));
    if (partners.size > 1) {
      wx.showToast({ title: '请选择同一加工厂的待收回项', icon: 'none' });
      return;
    }
    const app = getApp();
    if (app.globalData) {
      app.globalData.outsourceReceiveConfirm = {
        rows: selected,
        records: this._records || [],
        orders: this._orders || [],
        products: this._products || [],
        categories: this._categories || [],
        productMilestoneProgresses: this._pmp || [],
        productionLinkMode: this._productionLinkMode
      };
    }
    wx.navigateTo({
      url: '/packageBusiness/production-outsource-receive-confirm/production-outsource-receive-confirm'
    });
  },

  applyRows() {
    const filtered = filterReceiveRows(this._allRows || [], this.data.searchKeyword, {
      milestoneNodeId: this.data.milestoneNodeId
    });
    const rows = filtered.map((r) => mapReceiveRow(
      r,
      this._selectedKeys,
      this._productsById,
      this._productionLinkMode
    ));
    const hasFilter = !!(this.data.searchKeyword || this.data.milestoneNodeId);
    this.setData({
      rows,
      selectedCount: this._selectedKeys.size,
      emptyText: hasFilter ? '所选条件下暂无待收回项' : '暂无待收回外协'
    });
  },

  async bootstrap() {
    this._bootstrapping = true;
    this.setData({ loading: true });
    try {
      const config = await fetchTenantConfig().catch(() => ({}));
      this._productionLinkMode = config.productionLinkMode || 'order';
      const _await$Promise$all2 = await Promise.all([
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchNodesAll(),
        fetchCategoriesAll(),
        listProductProgressAll().catch(() => [])]
        ),orders = _await$Promise$all2[0],productsRaw = _await$Promise$all2[1],nodesRaw = _await$Promise$all2[2],categoriesRaw = _await$Promise$all2[3],pmpRaw = _await$Promise$all2[4];
      const products = normalizeMasterList(productsRaw);
      this._orders = orders || [];
      this._products = products;
      this._categories = normalizeMasterList(categoriesRaw);
      this._pmp = Array.isArray(pmpRaw) ? pmpRaw : [];
      const ordersById = new Map((orders || []).map((o) => [o.id, o]));
      const productsById = new Map(products.map((p) => [p.id, p]));
      this._productsById = productsById;
      this._nodes = normalizeMasterList(nodesRaw);
      const nodesById = new Map(this._nodes.map((n) => [n.id, n]));
      this._records = await fetchOutsourceRecordsForPanel({
        productionLinkMode: this._productionLinkMode,
        orders: orders || [],
        products
      });
      this._allRows = buildOutsourceReceiveAggregates(
        this._records,
        ordersById,
        productsById,
        nodesById
      ).filter((r) => r.pending > 0);
      this.setData({ loading: false });
      this.syncMilestoneOptions();
      this.applyRows();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
    } finally {
      this._bootstrapping = false;
      this._loadedOnce = true;
    }
  }
});