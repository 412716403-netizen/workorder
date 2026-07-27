const { readTenantCtx, readCurrentUserId } = require('../../utils/session.js');
const { markRead, markAllRead, syncReadsFromServer } = require('../../utils/notificationRead.js');
const { getCache } = require('../../utils/messagesCache.js');
const { buildConversations } = require('../../utils/messagesChatBuilder.js');
const { applyMessageLists, loadMessagesData } = require('../../utils/messagesLoad.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { openTodoEdit, updateTodo } = require('../../utils/todosApi.js');

function decodeOpt(v) {
  if (v == null || v === '') return '';
  try {
    return decodeURIComponent(String(v));
  } catch {
    return String(v);
  }
}

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx);
}

function buildMetaParts(b) {
  const parts = [];
  if (b.sourceLabel) parts.push(b.sourceLabel);
  if (b.sourceDocNo) parts.push(`单号 ${b.sourceDocNo}`);
  if (b.remindText) parts.push(`提醒 ${b.remindText}`);
  if (b.productName) parts.push(b.productName);
  if (b.quantity != null && b.quantity > 0) parts.push(`${b.quantity} 件`);
  if (b.docNo) parts.push(`单号 ${b.docNo}`);
  if (b.nextFactory) parts.push(`下一站 ${b.nextFactory}`);
  return parts;
}

function mapRows(bubbles) {
  const list = Array.isArray(bubbles) ? bubbles.slice() : [];
  list.sort((a, b) => (b.at || 0) - (a.at || 0));
  return list.map((b) => {
    const bodyText = b.body || '';
    return {
      ...b,
      body: bodyText,
      metaParts: buildMetaParts(b),
      unread: Boolean(b.unread),
      done: Boolean(b.done),
    };
  });
}

function filterRows(rows, keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return rows || [];
  return (rows || []).filter((item) => {
    const meta = (item.metaParts || []).join(' ');
    const hay = `${item.title || ''} ${item.body || ''} ${item.tagLabel || ''} ${meta}`.toLowerCase();
    return hay.indexOf(q) >= 0;
  });
}

function emptyTextFor(kind, hasKeyword) {
  if (hasKeyword) return '无搜索结果';
  if (kind === 'todos') return '暂无待办';
  if (kind === 'notifications') return '暂无系统消息';
  return '暂无协作记录';
}

function searchPlaceholderFor(kind) {
  if (kind === 'todos') return '搜索待办内容或关联单据';
  if (kind === 'notifications') return '搜索消息标题或内容';
  return '搜索协作记录';
}

Page({
  data: {
    title: '',
    conversationKind: '',
    rows: [],
    empty: false,
    emptyText: '暂无消息记录',
    showMarkAllRead: false,
    showManageTodos: false,
    unreadCount: 0,
    togglingTodoId: '',
    refreshing: false,
    scrollHeight: 600,
    searchKeyword: '',
    searchPlaceholder: '搜索',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 120,
  },

  onLoad(options) {
    const id = decodeOpt(options.id);
    this._conversationId = id;
    this._allRows = [];
    const nav = readNavBarMetrics();
    this._nav = nav;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
    this.loadConversation(id);
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    if (!this._conversationId) return;
    const ctx = readTenantCtx();
    const userId = readCurrentUserId();
    const reload = () => this.loadConversation(this._conversationId);

    // 首次由 onLoad 装载；从待办详情返回时需重拉，才能清「未完成」角标
    if (this._hasShown) {
      const isTodos =
        this.data.conversationKind === 'todos' || this._conversationId === 'todos';
      if (isTodos && ctx && ctx.tenantId) {
        this.reloadFromNetwork().catch(() => reload());
        return;
      }
    }
    this._hasShown = true;

    if (ctx && ctx.tenantId) {
      syncReadsFromServer(ctx.tenantId, userId).finally(reload);
    } else {
      reload();
    }
  },

  applyFilter(keyword) {
    const kw = keyword == null ? this.data.searchKeyword : keyword;
    const kind = this.data.conversationKind;
    const filtered = filterRows(this._allRows || [], kw);
    this.setData({
      searchKeyword: kw,
      rows: filtered,
      empty: filtered.length === 0,
      emptyText: emptyTextFor(kind, Boolean(String(kw || '').trim())),
    });
  },

  onSearchInput(e) {
    this.applyFilter(e.detail.value || '');
  },

  onSearchClear() {
    this.applyFilter('');
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onPullRefresh() {
    this.setData({ refreshing: true });
    this.reloadFromNetwork({ force: true })
      .catch(() => {})
      .finally(() => {
        this.setData({ refreshing: false });
      });
  },

  async reloadFromNetwork(opts) {
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) return;
    await loadMessagesData(ctx.tenantId, readCurrentUserId(), opts);
    this.loadConversation(this._conversationId);
  },

  loadConversation(id) {
    const normalizedId = id === 'inbox' ? 'notifications' : id;
    const cache = getCache();
    if (!cache) {
      wx.showToast({ title: '数据已过期，请返回重试', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    let conversation = (cache.conversations || []).find((c) => c.id === normalizedId);
    if (!conversation) {
      const result = buildConversations({
        notifications: cache.notifications,
        todos: cache.todos,
        transfers: cache.transfers,
        tenantId: cache.tenantId,
        userId: cache.userId,
      });
      conversation = result.conversations.find((c) => c.id === normalizedId);
    }

    if (!conversation) {
      wx.showToast({ title: '会话不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._conversation = conversation;
    let rows = mapRows(conversation.bubbles || []);
    const kind = conversation.kind || '';
    const isNotif = kind === 'notifications';
    const isTodos = kind === 'todos';

    // 进入消息中心即视为已阅读：清未读圆点，并同步会话/Tab 红点角标
    if (isNotif) {
      const ctx = readTenantCtx();
      const userId = readCurrentUserId();
      const ids = rows
        .filter((r) => r.kind === 'notification' && r.id)
        .map((r) => String(r.id));
      // 同时标记缓存中的全部通知 id，避免列表行与 raw 列表不一致漏标
      const cacheIds = (cache.notifications || [])
        .filter((n) => n && n.id && n.type !== 'todo')
        .map((n) => String(n.id));
      const allIds = Array.from(new Set(ids.concat(cacheIds)));
      if (ctx && allIds.length) {
        markAllRead(ctx.tenantId, userId, allIds);
      }
      rows = rows.map((r) =>
        r.kind === 'notification' ? { ...r, unread: false } : r,
      );
      this.refreshTabBadgeFromCache();
    }

    const unreadCount = rows.filter((r) => r.kind === 'notification' && r.unread).length;
    const searchKeyword = this.data.searchKeyword || '';

    this._allRows = rows;
    const filtered = filterRows(rows, searchKeyword);
    this.setData({
      title: conversation.title,
      conversationKind: kind,
      rows: filtered,
      empty: filtered.length === 0,
      emptyText: emptyTextFor(kind, Boolean(String(searchKeyword).trim())),
      showMarkAllRead: isNotif,
      showManageTodos: isTodos,
      searchPlaceholder: searchPlaceholderFor(kind),
      unreadCount,
    });
  },

  refreshTabBadgeFromCache() {
    const cache = getCache();
    if (!cache) return;
    const ctx = readTenantCtx();
    applyMessageLists((ctx && ctx.tenantId) || cache.tenantId, readCurrentUserId(), {
      notifList: cache.notifications,
      todoList: cache.todos,
      transferList: cache.transfers,
    });
  },

  onMarkAllRead() {
    if (this.data.unreadCount === 0) return;
    const ctx = readTenantCtx();
    const userId = readCurrentUserId();
    if (!ctx) return;
    const ids = (this._allRows || [])
      .filter((r) => r.kind === 'notification' && r.id)
      .map((r) => r.id);
    markAllRead(ctx.tenantId, userId, ids);
    this._allRows = (this._allRows || []).map((r) =>
      r.kind === 'notification' ? { ...r, unread: false } : r,
    );
    this.setData({
      unreadCount: 0,
    });
    this.applyFilter(this.data.searchKeyword);
    this.refreshTabBadgeFromCache();
    wx.showToast({ title: '已全部标为已读', icon: 'success' });
  },

  onManageTodos() {
    wx.navigateTo({ url: '/packageBusiness/todos/todos' });
  },

  /** 勾选完成 / 取消完成；同步缓存与 Tab 角标 */
  onTodoToggleTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.togglingTodoId) return;
    const row =
      (this._allRows || []).find((b) => String(b.id) === String(id)) ||
      (this.data.rows || []).find((b) => String(b.id) === String(id));
    if (!row || row.kind !== 'todo') return;

    const nextDone = !row.done;
    const nextStatus = nextDone ? 'done' : 'open';
    this.setData({ togglingTodoId: String(id) });

    updateTodo(id, { status: nextStatus })
      .then(() => {
        const patchRow = (r) => {
          if (String(r.id) !== String(id)) return r;
          const raw = r.raw ? { ...r.raw, status: nextStatus } : r.raw;
          return {
            ...r,
            done: nextDone,
            tagLabel: nextDone ? '已完成' : '待处理',
            tagTone: nextDone ? 'muted' : 'warning',
            preview: nextDone
              ? `[已完成] ${String(r.title || '').replace(/^\[已完成\]\s*/, '')}`
              : String(r.title || ''),
            raw,
          };
        };
        this._allRows = (this._allRows || []).map(patchRow);
        this.applyFilter(this.data.searchKeyword);

        const cache = getCache();
        if (cache && Array.isArray(cache.todos)) {
          cache.todos = cache.todos.map((t) =>
            String(t.id) === String(id) ? { ...t, status: nextStatus } : t,
          );
          this.refreshTabBadgeFromCache();
        }
        wx.showToast({
          title: nextDone ? '已完成' : '已还原为未完成',
          icon: 'success',
        });
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.message) || '操作失败',
          icon: 'none',
        });
      })
      .finally(() => {
        this.setData({ togglingTodoId: '' });
      });
  },

  openMessageDetail(row) {
    const payload = {
      title: (row && row.title) || '消息详情',
      body: (row && row.body) || '暂无内容',
      tagLabel: (row && row.tagLabel) || '',
      tagTone: (row && row.tagTone) || 'muted',
      timeText: (row && row.timeText) || '',
    };
    wx.navigateTo({
      url: '/pages/message-detail/message-detail',
      success(res) {
        if (res.eventChannel && typeof res.eventChannel.emit === 'function') {
          res.eventChannel.emit('messageDetailInit', payload);
        }
      },
    });
  },

  onRowTap(e) {
    const { id, kind } = e.currentTarget.dataset;
    if (kind === 'notification') {
      const ctx = readTenantCtx();
      if (ctx && id) markRead(ctx.tenantId, readCurrentUserId(), id);

      this._allRows = (this._allRows || []).map((b) =>
        String(b.id) === String(id) ? { ...b, unread: false } : b,
      );
      const unreadCount = (this._allRows || []).filter(
        (r) => r.kind === 'notification' && r.unread,
      ).length;
      this.setData({
        unreadCount,
      });
      this.applyFilter(this.data.searchKeyword);
      this.refreshTabBadgeFromCache();

      const row = (this._allRows || []).find((r) => String(r.id) === String(id));
      this.openMessageDetail(row || { title: '消息详情', body: '暂无内容' });
      return;
    }
    if (kind === 'todo') {
      const row = (this._allRows || []).find((b) => String(b.id) === String(id))
        || (this.data.rows || []).find((b) => String(b.id) === String(id));
      const editing = (row && row.raw) || (row ? { id: row.id, note: row.body || row.title, href: row.href } : null);
      if (!editing || !editing.id) {
        wx.showToast({ title: '待办不存在', icon: 'none' });
        return;
      }
      openTodoEdit({ editing });
      return;
    }
    if (kind === 'dispatch' || kind === 'return' || kind === 'agg-return' || kind === 'forward') {
      wx.showToast({ title: '请在电脑端协作管理处理', icon: 'none', duration: 2500 });
      return;
    }
  },
});
