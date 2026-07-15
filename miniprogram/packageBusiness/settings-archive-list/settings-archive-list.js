const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../../config/settingsTabs.js'),getSettingsTab = _require3.getSettingsTab;
const _require4 =



  require('../utils/settingsArchive.js'),getArchiveTabMeta = _require4.getArchiveTabMeta,buildArchiveListRows = _require4.buildArchiveListRows,filterArchiveListByKeyword = _require4.filterArchiveListByKeyword;
const settingsApi = require('../../utils/settingsApi.js');
const _require5 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require5.readNavBarMetrics,readWindowMetrics = _require5.readWindowMetrics;
const _require6 = require('../../utils/saveNavigation.js'),shouldHubListRefetch = _require6.shouldHubListRefetch,trackHubListHidden = _require6.trackHubListHidden;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function hubRouteForTab(tabId) {
  const meta = getArchiveTabMeta(tabId);
  if (!meta) return '';
  return meta.listRoute.replace(/^\//, '').split('?')[0];
}

Page({
  data: {
    title: '系统设置',
    loading: true,
    rows: [],
    searchKeyword: '',
    emptyText: '暂无数据',
    canCreate: false,
    canReorder: false,
    reordering: false,
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
    this._tabId = options.id ? decodeURIComponent(options.id) : '';
    this._initialized = false;
    this._allRows = [];
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
    const meta = getArchiveTabMeta(this._tabId);
    if (!meta) {
      wx.showToast({ title: '设置项不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const perms = ctx.permissions || [];
    if (
    ctx.tenantRole !== 'owner' &&
    !hasPermission(perms, `${meta.permBase}:view`))
    {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    this.setData({
      canCreate:
      ctx.tenantRole === 'owner' ||
      hasPermission(perms, `${meta.permBase}:create`),
      canReorder:
      this._tabId === 'nodes' && (
      ctx.tenantRole === 'owner' || hasPermission(perms, `${meta.permBase}:edit`))
    });
    const hubRoute = hubRouteForTab(this._tabId);
    if (!this._initialized) {
      this.bootstrap();
    } else if (shouldHubListRefetch(this, hubRoute)) {
      this.bootstrap();
    }
  },

  onHide() {
    const hubRoute = hubRouteForTab(this._tabId);
    if (hubRoute) trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    const tab = getSettingsTab(this._tabId);
    const meta = getArchiveTabMeta(this._tabId);
    if (!tab || !meta) return;

    this._initialized = true;
    wx.setNavigationBarTitle({ title: tab.title });
    this.setData({ title: tab.title, loading: true });

    try {
      const api = settingsApi[meta.apiKey];
      const _await$Promise$all = await Promise.all([
        api.fetchAll(),
        api.fetchUsage().catch(() => new Set())]
        ),list = _await$Promise$all[0],usage = _await$Promise$all[1];
      this._allRows = buildArchiveListRows(list, this._tabId, usage);
      this.applyFilter();
    } catch {
      this._allRows = [];
      this.setData({ rows: [], loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  applyFilter() {
    const rows = filterArchiveListByKeyword(this._allRows, this.data.searchKeyword);
    this.setData({
      rows,
      loading: false,
      reordering: false,
      emptyText: '暂无数据'
    });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    this.applyFilter();
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyFilter();
  },

  onCreateTap() {
    if (!this.data.canCreate) {
      wx.showToast({ title: '暂无新建权限', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/packageBusiness/settings-archive-edit/settings-archive-edit?tab=${encodeURIComponent(this._tabId)}`
    });
  },

  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/packageBusiness/settings-archive-edit/settings-archive-edit?tab=${encodeURIComponent(this._tabId)}&id=${encodeURIComponent(id)}`
    });
  },

  async onMoveNode(e) {
    if (!this.data.canReorder || this.data.reordering) return;
    const _e$currentTarget$data = e.currentTarget.dataset,id = _e$currentTarget$data.id,dir = _e$currentTarget$data.dir;
    if (!id || !dir) return;
    const ids = (this._allRows || []).map((r) => r.id);
    const idx = ids.indexOf(id);
    if (idx < 0) return;
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= ids.length) return;
    const nextIds = ids.slice();
    const tmp = nextIds[idx];
    nextIds[idx] = nextIds[target];
    nextIds[target] = tmp;
    this.setData({ reordering: true });
    try {
      await settingsApi.nodes.reorder(nextIds);
      await this.bootstrap();
    } catch (err) {
      wx.showToast({ title: err && err.message || '排序失败', icon: 'none' });
      this.setData({ reordering: false });
    }
  }
});