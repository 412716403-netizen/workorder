const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { fetchKnowledgeTree, listKnowledgeDocuments } = require('../utils/knowledgeApi.js');
const {
  buildFolderPath,
  buildCurrentLevelRows,
  buildSearchResultRows,
} = require('../utils/knowledgeTree.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    rows: [],
    searchKeyword: '',
    searching: false,
    breadcrumb: [],
    currentFolderId: '',
    emptyText: '暂无文档',
    canGoUp: false,
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
    this._tree = { folders: [], documents: [] };
    this._folderStack = [];
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
    this._tenantCtx = ctx;

    loadFeaturePlugins().then((plugins) => {
      if (!isPluginEnabled(plugins, 'knowledge_base')) {
        wx.showToast({ title: '资料库插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const perms = ctx.permissions || [];
      if (
        !hasPermission(perms, 'knowledge_base:documents:view') ||
        !hasPermission(perms, 'knowledge_base:folders:view')
      ) {
        wx.showToast({ title: '无权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      if (!this._initialized) {
        this.bootstrap();
      }
    });
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.applySearchOrTree(), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '', searching: false });
    this.reloadCurrentLevel();
  },

  onBreadcrumbRoot() {
    if (this.data.searching) return;
    this._folderStack = [];
    this.setData({ currentFolderId: '' });
    this.reloadCurrentLevel();
  },

  onBreadcrumbTap(e) {
    if (this.data.searching) return;
    const id = e.currentTarget.dataset.id;
    if (!id) {
      this.onBreadcrumbRoot();
      return;
    }
    const idx = this._folderStack.findIndex((x) => x.id === id);
    if (idx < 0) return;
    this._folderStack = this._folderStack.slice(0, idx + 1);
    this.setData({ currentFolderId: id });
    this.reloadCurrentLevel();
  },

  onGoUp() {
    if (this.data.searching || !this._folderStack.length) return;
    this._folderStack = this._folderStack.slice(0, -1);
    const currentFolderId = this._folderStack.length
      ? this._folderStack[this._folderStack.length - 1].id
      : '';
    this.setData({ currentFolderId });
    this.reloadCurrentLevel();
  },

  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    const kind = e.currentTarget.dataset.kind;
    if (!id || !kind) return;
    if (kind === 'folder') {
      if (this.data.searching) return;
      const folder = (this._tree.folders || []).find((f) => f.id === id);
      const name = (folder && folder.name) || '文件夹';
      this._folderStack = this._folderStack.concat([{ id, name }]);
      this.setData({ currentFolderId: id });
      this.reloadCurrentLevel();
      return;
    }
    const title = e.currentTarget.dataset.title || '';
    wx.navigateTo({
      url: `/packageBusiness/knowledge-doc-detail/knowledge-doc-detail?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`,
    });
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      this._tree = await fetchKnowledgeTree();
      await this.applySearchOrTree();
    } catch (err) {
      this.setData({
        loading: false,
        rows: [],
        emptyText: (err && err.message) || '加载失败',
      });
    }
  },

  async applySearchOrTree() {
    const q = String(this.data.searchKeyword || '').trim();
    if (!q) {
      this.setData({ searching: false });
      this.reloadCurrentLevel();
      return;
    }
    this.setData({ loading: true, searching: true, canGoUp: false });
    try {
      const docs = await listKnowledgeDocuments({ search: q });
      const rows = buildSearchResultRows(docs);
      this.setData({
        loading: false,
        rows,
        breadcrumb: [],
        emptyText: '未找到相关文档',
      });
    } catch (err) {
      this.setData({
        loading: false,
        rows: [],
        emptyText: (err && err.message) || '搜索失败',
      });
    }
  },

  reloadCurrentLevel() {
    const folderId = this.data.currentFolderId || '';
    const path = buildFolderPath(this._tree.folders || [], folderId || null);
    this._folderStack = path.slice();
    const rows = buildCurrentLevelRows(this._tree, folderId || null);
    this.setData({
      loading: false,
      searching: false,
      rows,
      breadcrumb: path,
      canGoUp: path.length > 0,
      emptyText: path.length ? '此文件夹为空' : '暂无文档',
    });
  },
});
