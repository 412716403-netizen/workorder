const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  buildOutsourceDispatchRows,
  buildDispatchMilestoneOptions,
  mapDispatchRowForUi,
  filterDispatchRows,
  dispatchRowKey,
} = require('../utils/outsourceDispatchLite.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const { fetchOutsourceRecordsForPanel } = require('../utils/outsourceRecordsLoad.js');
const {
  fetchTenantConfig,
  fetchProductsAll,
  fetchNodesAll,
  fetchCategoriesAll,
  listProductProgressAll,
} = require('../utils/orderApi.js');
const { normalizeMasterList } = require('../utils/productionPlans.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
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

Page({
  data: {
    loading: true,
    rows: [],
    searchKeyword: '',
    selectedCount: 0,
    showFilterPanel: false,
    filterActive: false,
    milestoneOptions: [{ id: '', name: '全部工序' }],
    milestoneNodeId: '',
    milestoneFilterIndex: 0,
    milestoneFilterLabel: '全部工序',
    draftMilestoneFilterIndex: 0,
    draftMilestoneFilterLabel: '全部工序',
    emptyText: '暂无可外协项',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission((ctx && ctx.permissions) || [], 'production:outsource_send:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._selectedKeys = new Set();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });
    this.bootstrap();
  },

  onShow() {
    if (this._loadedOnce && !this._bootstrapping) {
      this._selectedKeys = new Set();
      this.setData({ selectedCount: 0 });
      this.bootstrap();
    }
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onPageScroll() {
    if (this.data.showFilterPanel) {
      this.patchFilterActive({ showFilterPanel: false });
    }
  },

  patchFilterActive(extra) {
    this.setData({
      ...extra,
      filterActive: computeFilterActive({ ...this.data, ...extra }),
    });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.patchFilterActive({ showFilterPanel: false });
      return;
    }
    this.patchFilterActive({
      showFilterPanel: true,
      draftMilestoneFilterIndex: this.data.milestoneFilterIndex,
      draftMilestoneFilterLabel: this.data.milestoneFilterLabel,
    });
  },

  onDraftMilestoneChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = milestoneOptionAt(this.data.milestoneOptions, idx);
    this.setData({
      draftMilestoneFilterIndex: idx,
      draftMilestoneFilterLabel: opt.name || '全部工序',
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
      searchKeyword: '',
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
      showFilterPanel: false,
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
      milestoneFilterLabel: milestoneOpt.name || '全部工序',
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
    const { key } = e.currentTarget.dataset;
    if (!key) return;
    const rows = (this.data.rows || []).map((row) =>
      (row.rowKey === key ? { ...row, showProductImage: false } : row),
    );
    this.setData({ rows });
  },

  onRowTap(e) {
    const key = e.currentTarget.dataset.key;
    const row = (this._allRows || []).find((r) => dispatchRowKey(r) === key);
    if (!row) return;
    if (this._selectedKeys.has(key)) this._selectedKeys.delete(key);
    else this._selectedKeys.add(key);
    this.applyRows();
  },

  onConfirmTap() {
    if (!this._selectedKeys.size) return;
    const selected = (this._allRows || []).filter((r) => this._selectedKeys.has(dispatchRowKey(r)));
    const app = getApp();
    if (app.globalData) {
      app.globalData.outsourceDispatchConfirm = {
        rows: selected,
        productionLinkMode: this._productionLinkMode,
        records: this._records || [],
        orders: this._orders || [],
        products: this._products || [],
        categories: this._categories || [],
        productMilestoneProgresses: this._pmp || [],
        processSequenceMode: this._processSequenceMode || 'sequential',
        nodes: this._nodes || [],
      };
    }
    wx.navigateTo({
      url: '/packageBusiness/production-outsource-dispatch-confirm/production-outsource-dispatch-confirm',
    });
  },

  applyRows() {
    const filtered = filterDispatchRows(this._allRows || [], this.data.searchKeyword, {
      milestoneNodeId: this.data.milestoneNodeId,
    });
    const rows = filtered.map((r) => mapDispatchRowForUi(
      r,
      this._productionLinkMode,
      this._selectedKeys,
      this._productsById,
    ));
    const hasFilter = !!(this.data.searchKeyword || this.data.milestoneNodeId);
    this.setData({
      rows,
      selectedCount: this._selectedKeys.size,
      emptyText: hasFilter ? '所选条件下暂无可外协项' : '暂无可外协项',
    });
  },

  async bootstrap() {
    this._bootstrapping = true;
    this.setData({ loading: true });
    try {
      const config = await fetchTenantConfig().catch(() => ({}));
      this._productionLinkMode = config.productionLinkMode || 'order';
      const settings = config.outsourceFormSettings || {};
      const onlyIncomplete = settings.onlyShowNotCompletedOrder === true;

      const [orders, productsRaw, nodesRaw, categoriesRaw, pmpRaw] = await Promise.all([
        fetchAllOrdersPaginated(onlyIncomplete ? { excludeCompleted: 'true' } : {}),
        fetchProductsAll(),
        fetchNodesAll(),
        fetchCategoriesAll(),
        listProductProgressAll(),
      ]);

      const products = normalizeMasterList(productsRaw);
      this._products = products;
      this._productsById = new Map(products.map((p) => [p.id, p]));
      this._categories = normalizeMasterList(categoriesRaw);
      this._nodes = normalizeMasterList(nodesRaw);
      this._pmp = Array.isArray(pmpRaw) ? pmpRaw : [];
      this._processSequenceMode = config.processSequenceMode || 'sequential';
      this._orders = orders || [];

      this._records = await fetchOutsourceRecordsForPanel({
        productionLinkMode: this._productionLinkMode,
        orders: this._orders,
        products,
      });
      this._allRows = buildOutsourceDispatchRows({
        productionLinkMode: this._productionLinkMode,
        records: this._records,
        orders: this._orders,
        products,
        nodes: this._nodes,
        categories: this._categories,
        productMilestoneProgresses: this._pmp,
        processSequenceMode: this._processSequenceMode,
        onlyShowIncompleteOrders: onlyIncomplete,
      });

      this.setData({ loading: false });
      this.syncMilestoneOptions();
      this.applyRows();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    } finally {
      this._bootstrapping = false;
      this._loadedOnce = true;
    }
  },
});
