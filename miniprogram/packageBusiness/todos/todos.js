const { readTenantCtx } = require('../../utils/session.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { navigateTodoHref } = require('../utils/todoNavigate.js');
const {
  listTodos,
  updateTodo,
  openTodoEdit,
  formatTodoRemindAt,
  todoDocLabel,
} = require('../utils/todosApi.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function mapTodoRows(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const docLabel = todoDocLabel(item);
    const done = item.status === 'done';
    const remindText =
      item.remindEnabled && item.remindAt ? formatTodoRemindAt(item.remindAt) : '';
    return {
      ...item,
      docLabel,
      done,
      remindText,
      showDoc: !!docLabel,
      canJump: !!(item.href && docLabel),
      showRemind: !!remindText,
    };
  });
}

function filterRows(rows, keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((item) => {
    const hay = `${item.note || ''} ${item.sourceDocNo || ''} ${item.sourceTitle || ''}`.toLowerCase();
    return hay.indexOf(q) >= 0;
  });
}

Page({
  data: {
    loading: true,
    tab: 'open',
    searchKeyword: '',
    hideCreate: false,
    rows: [],
    emptyText: '暂无待办，点「新建」添加',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 120,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._allRows = [];
    let searchKeyword = '';
    try {
      searchKeyword = options && options.q ? decodeURIComponent(options.q) : '';
    } catch (e) {
      searchKeyword = (options && options.q) || '';
    }
    const hideCreate =
      !!(options && (options.hideCreate === '1' || options.hideCreate === 'true'));
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      searchKeyword,
      hideCreate,
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
      if (!isPluginEnabled(plugins, 'todo_reminder')) {
        wx.showToast({ title: '待办提醒插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.reload();
    });
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab });
    this.reload();
  },

  onSearchInput(e) {
    const searchKeyword = (e.detail && e.detail.value) || '';
    this.setData({ searchKeyword });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.applyFilter(), 250);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyFilter();
  },

  onCreateTap() {
    openTodoEdit({});
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this._allRows || []).find((t) => t.id === id);
    if (!item) return;
    openTodoEdit({ editing: item });
  },

  onToggleTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this._allRows || []).find((t) => t.id === id);
    if (!item) return;
    const nextStatus = item.status === 'done' ? 'open' : 'done';
    updateTodo(id, { status: nextStatus })
      .then(() => this.reload())
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
      });
  },

  onDocTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this._allRows || []).find((t) => t.id === id);
    if (!item || !item.href) return;
    navigateTodoHref(item.href);
  },

  applyFilter() {
    const rows = filterRows(this._allRows || [], this.data.searchKeyword);
    const emptyText = this.data.searchKeyword.trim()
      ? '未找到匹配的待办'
      : this.data.tab === 'open'
        ? this.data.hideCreate
          ? '暂无相关待办'
          : '暂无待办，点「新建」添加'
        : '暂无已完成待办';
    this.setData({ rows, emptyText });
  },

  async reload() {
    this.setData({ loading: true });
    try {
      const items = await listTodos({ status: this.data.tab });
      this._allRows = mapTodoRows(items);
      this.setData({ loading: false });
      this.applyFilter();
    } catch (err) {
      this._allRows = [];
      this.setData({ loading: false, rows: [], emptyText: '加载失败' });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },
});
