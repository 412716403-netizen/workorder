const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const {
  shouldHubListRefetch,
  trackHubListHidden,
  LIST_ROUTES,
} = require('../../utils/saveNavigation.js');
const {
  markFilterPanelOpen,
  shouldCloseFilterPanelOnScroll,
} = require('../../utils/planFilterPanel.js');
const { fetchPartnersAll } = require('../../utils/planApi.js');
const {
  listDevStyles,
  listDevStageTemplates,
} = require('../utils/developmentApi.js');
const {
  filterDevStyles,
  hasActiveDevStyleListFilter,
  collectDevStageFilterOptions,
  sortDevStyles,
  buildDevStyleListRows,
} = require('../utils/devStyleListFilter.js');

const HUB_LIST_ROUTE = LIST_ROUTES.DEVELOPMENT_STYLES.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function isFilterActive(filters, tab, sortMode) {
  return hasActiveDevStyleListFilter(filters, tab) || sortMode === 'customer';
}

function guardDevelopmentAccess(ctx) {
  return loadFeaturePlugins().then((plugins) => {
    if (!isPluginEnabled(plugins, 'development')) {
      return { ok: false, reason: '开发管理插件未开启' };
    }
    const perms = (ctx && ctx.permissions) || [];
    if (!hasPermission(perms, 'development:styles:view')) {
      return { ok: false, reason: '无权限' };
    }
    return { ok: true, plugins };
  });
}

Page({
  data: {
    loading: true,
    rows: [],
    searchKeyword: '',
    activeTab: 'developing',
    sortMode: 'time',
    filterStageName: 'all',
    filterSyncStatus: 'all',
    draftSortMode: 'time',
    draftStageName: 'all',
    draftSyncStatus: 'all',
    stageFilterOptions: [],
    showCustomerSort: false,
    filterActive: false,
    emptyText: '暂无开发中的款式',
    canCreate: false,
    canViewTemplates: false,
    showFilterPanel: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });
    this._initialized = false;
    this._styles = [];
    this._templates = [];
    this._partners = [];
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
    this._tenantCtx = ctx;
    guardDevelopmentAccess(ctx).then((g) => {
      if (!g.ok) {
        wx.showToast({ title: g.reason, icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const perms = ctx.permissions || [];
      this.setData({
        canCreate: hasPermission(perms, 'development:styles:create'),
        canViewTemplates: hasPermission(perms, 'development:templates:view'),
      });
      if (!this._initialized) {
        this.bootstrap();
      } else if (shouldHubListRefetch(this, HUB_LIST_ROUTE)) {
        this.bootstrap();
      }
    });
  },

  onHide() {
    trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onPageScroll() {
    if (!shouldCloseFilterPanelOnScroll(this)) return;
    this.closeFilterPanel();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [styles, templates, partners] = await Promise.all([
        listDevStyles(),
        listDevStageTemplates().catch(() => []),
        fetchPartnersAll().catch(() => []),
      ]);
      this._styles = Array.isArray(styles) ? styles : [];
      this._templates = Array.isArray(templates) ? templates : [];
      this._partners = Array.isArray(partners) ? partners : [];
      this._initialized = true;
      this.reloadList();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false, rows: [], emptyText: '加载失败' });
    }
  },

  reloadList() {
    const activeTab = this.data.activeTab;
    const filters = {
      stageName: this.data.filterStageName || 'all',
      syncStatus: this.data.filterSyncStatus || 'all',
    };
    const filtered = filterDevStyles(this._styles, {
      activeTab,
      searchQuery: this.data.searchKeyword,
      filters,
      partners: this._partners,
    });
    const sorted = sortDevStyles(filtered, this.data.sortMode, this._partners);
    const rows = buildDevStyleListRows(sorted, this._partners);
    const stageFilterOptions = collectDevStageFilterOptions(this._templates, this._styles);
    const showCustomerSort = (this._partners || []).length > 0;
    this.setData({
      loading: false,
      rows,
      stageFilterOptions,
      showCustomerSort,
      filterActive: isFilterActive(filters, activeTab, this.data.sortMode),
      emptyText:
        activeTab === 'archived' ? '暂无已归档/已发布款式' : '暂无开发中的款式',
    });
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

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.closeFilterPanel();
    this.setData({
      activeTab: tab,
      filterStageName: 'all',
      filterSyncStatus: 'all',
      draftStageName: 'all',
      draftSyncStatus: 'all',
    });
    this.reloadList();
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    markFilterPanelOpen(this);
    this._filterSnapshot = {
      sortMode: this.data.sortMode,
      filterStageName: this.data.filterStageName,
      filterSyncStatus: this.data.filterSyncStatus,
    };
    this.setData({
      showFilterPanel: true,
      draftSortMode: this.data.sortMode,
      draftStageName: this.data.filterStageName,
      draftSyncStatus: this.data.filterSyncStatus,
    });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    const snap = this._filterSnapshot || {};
    this.setData({
      showFilterPanel: false,
      draftSortMode: snap.sortMode != null ? snap.sortMode : 'time',
      draftStageName: snap.filterStageName != null ? snap.filterStageName : 'all',
      draftSyncStatus: snap.filterSyncStatus != null ? snap.filterSyncStatus : 'all',
    });
  },

  onDraftSortTap(e) {
    const mode = e.currentTarget.dataset.mode || 'time';
    if (mode === 'customer' && !this.data.showCustomerSort) {
      wx.showToast({ title: '暂无合作单位，无法按客户排序', icon: 'none' });
      return;
    }
    this.setData({ draftSortMode: mode });
  },

  onDraftStageTap(e) {
    this.setData({ draftStageName: e.currentTarget.dataset.name || 'all' });
  },

  onDraftSyncTap(e) {
    this.setData({ draftSyncStatus: e.currentTarget.dataset.sync || 'all' });
  },

  onFilterReset() {
    this._filterSnapshot = {
      sortMode: 'time',
      filterStageName: 'all',
      filterSyncStatus: 'all',
    };
    this.setData({
      sortMode: 'time',
      filterStageName: 'all',
      filterSyncStatus: 'all',
      draftSortMode: 'time',
      draftStageName: 'all',
      draftSyncStatus: 'all',
      showFilterPanel: false,
      filterActive: false,
    });
    this.reloadList();
  },

  onFilterApply() {
    const sortMode = this.data.draftSortMode || 'time';
    const filterStageName = this.data.draftStageName || 'all';
    const filterSyncStatus = this.data.draftSyncStatus || 'all';
    this._filterSnapshot = { sortMode, filterStageName, filterSyncStatus };
    this.setData({
      sortMode,
      filterStageName,
      filterSyncStatus,
      showFilterPanel: false,
      filterActive: isFilterActive(
        { stageName: filterStageName, syncStatus: filterSyncStatus },
        this.data.activeTab,
        sortMode,
      ),
    });
    this.reloadList();
  },

  onCreateTap() {
    if (!this.data.canCreate) {
      wx.showToast({ title: '暂无新建权限', icon: 'none' });
      return;
    }
    this.closeFilterPanel();
    wx.navigateTo({
      url: '/packageBusiness/development-style-edit/development-style-edit',
      events: {
        hubListChanged: () => this.bootstrap(),
      },
    });
  },

  onTemplatesTap() {
    if (!this.data.canViewTemplates) {
      wx.showToast({ title: '暂无节点库权限', icon: 'none' });
      return;
    }
    this.closeFilterPanel();
    wx.navigateTo({
      url: '/packageBusiness/development-stage-templates/development-stage-templates',
    });
  },

  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.closeFilterPanel();
    wx.navigateTo({
      url: `/packageBusiness/development-style-detail/development-style-detail?styleId=${encodeURIComponent(id)}`,
      events: {
        hubListChanged: () => this.bootstrap(),
      },
    });
  },

  onImageError(e) {
    const id = e.currentTarget.dataset.id;
    const rows = (this.data.rows || []).map((row) => {
      if (row.id !== id) return row;
      return { ...row, showProductImage: false };
    });
    this.setData({ rows });
  },
});
