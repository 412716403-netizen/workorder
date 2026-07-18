const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const {
  listDevStageTemplates,
  deleteDevStageTemplate,
  updateDevStageTemplate,
} = require('../utils/developmentApi.js');

const FIELD_PREVIEW_LIMIT = 4;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function sortTemplates(list) {
  return [...(list || [])].sort(
    (a, b) => (a.order || 0) - (b.order || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'),
  );
}

function buildRow(t, idx, total) {
  const fields = [...(t.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const fieldCount = fields.length;
  const labels = fields
    .map((f) => String(f.label || '').trim())
    .filter(Boolean);
  const fieldLabels = labels.slice(0, FIELD_PREVIEW_LIMIT);
  const fieldMore = Math.max(0, labels.length - fieldLabels.length);
  let metaText = fieldCount ? `${fieldCount} 个登记字段` : '未配置登记字段';
  return {
    id: t.id,
    name: t.name || '未命名节点',
    fieldCount,
    orderLabel: String(idx + 1),
    metaText,
    fieldLabels,
    fieldMore,
    canMoveUp: idx > 0,
    canMoveDown: idx < total - 1,
  };
}

function filterTemplates(list, keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return list || [];
  return (list || []).filter((t) => {
    if (String(t.name || '').toLowerCase().indexOf(q) >= 0) return true;
    return (t.fields || []).some((f) => String(f.label || '').toLowerCase().indexOf(q) >= 0);
  });
}

Page({
  data: {
    loading: true,
    rows: [],
    totalCount: 0,
    searchKeyword: '',
    canCreate: false,
    canEdit: false,
    canDelete: false,
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
    loadFeaturePlugins().then((plugins) => {
      if (!isPluginEnabled(plugins, 'development')) {
        wx.showToast({ title: '开发管理插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const perms = ctx.permissions || [];
      if (!hasPermission(perms, 'development:templates:view')) {
        wx.showToast({ title: '无权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.setData({
        canCreate: hasPermission(perms, 'development:templates:create'),
        canEdit: hasPermission(perms, 'development:templates:edit'),
        canDelete: hasPermission(perms, 'development:templates:delete'),
      });
      this.bootstrap();
    });
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    this.applyFilter();
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyFilter();
  },

  applyFilter() {
    const sorted = this._templates || [];
    const filtered = filterTemplates(sorted, this.data.searchKeyword);
    // 搜索时仍按全库顺序号展示，便于对照
    const idToIdx = new Map(sorted.map((t, i) => [t.id, i]));
    const rows = filtered.map((t) => {
      const idx = idToIdx.has(t.id) ? idToIdx.get(t.id) : 0;
      return buildRow(t, idx, sorted.length);
    });
    // 搜索时禁用排序，保留全库序号便于对照
    if (this.data.searchKeyword) {
      rows.forEach((r) => {
        r.canMoveUp = false;
        r.canMoveDown = false;
      });
    }
    this.setData({
      rows,
      totalCount: sorted.length,
    });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const list = await listDevStageTemplates();
      this._templates = sortTemplates(list);
      this.setData({ loading: false });
      this.applyFilter();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this._templates = [];
      this.setData({ loading: false, rows: [], totalCount: 0 });
    }
  },

  onCreateTap() {
    if (!this.data.canCreate) return;
    wx.navigateTo({
      url: '/packageBusiness/development-stage-template-edit/development-stage-template-edit',
    });
  },

  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || !this.data.canEdit) {
      if (!this.data.canEdit) wx.showToast({ title: '暂无编辑权限', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/packageBusiness/development-stage-template-edit/development-stage-template-edit?id=${encodeURIComponent(id)}`,
    });
  },

  async onMove(e) {
    if (!this.data.canEdit || this._moving) return;
    if (this.data.searchKeyword) {
      wx.showToast({ title: '请清空搜索后再排序', icon: 'none' });
      return;
    }
    const id = e.currentTarget.dataset.id;
    const dir = e.currentTarget.dataset.dir;
    const list = [...(this._templates || [])];
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;

    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
    // 按新顺序重写 order，避免同 order 互换无效
    const updates = list
      .map((t, i) => ({ id: t.id, order: i + 1, prev: t.order }))
      .filter((u) => u.prev !== u.order);

    this._moving = true;
    try {
      await Promise.all(updates.map((u) => updateDevStageTemplate(u.id, { order: u.order })));
      this._templates = list.map((t, i) => ({ ...t, order: i + 1 }));
      this.applyFilter();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '排序失败', icon: 'none' });
      this.bootstrap();
    } finally {
      this._moving = false;
    }
  },

  async onDeleteTap(e) {
    if (!this.data.canDelete) return;
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((r) => r.id === id);
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '删除节点',
        content: `确定删除「${row ? row.name : ''}」？已在款式中使用的节点名称不会自动移除。`,
        confirmColor: '#d92d20',
        success: (res) => resolve(!!res.confirm),
      });
    });
    if (!ok) return;
    try {
      await deleteDevStageTemplate(id);
      wx.showToast({ title: '已删除', icon: 'success' });
      this.bootstrap();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  },
});
