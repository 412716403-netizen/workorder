const { request } = require('../../utils/request.js');
const { readTenantCtx, readCurrentUserId } = require('../../utils/session.js');
const { buildConversations } = require('../../utils/messagesChatBuilder.js');
const { updateMessagesTabBadge } = require('../../utils/messagesTabBadge.js');
const { setCache } = require('../../utils/messagesCache.js');
const { normalizeListBody } = require('../../utils/listResponse.js');
const { readTabShellInsets } = require('../../utils/tabShell.js');
const { syncCurrentCustomTabBar } = require('../../utils/tabAccess.js');

function filterConversations(conversations, keyword) {
  const kw = (keyword || '').trim().toLowerCase();
  if (!kw) return conversations;
  return (conversations || []).filter(
    (c) =>
      (c.title && c.title.toLowerCase().includes(kw))
      || (c.lastSummary && c.lastSummary.toLowerCase().includes(kw)),
  );
}

function markLastConversation(rows) {
  return (rows || []).map((item, index, arr) => ({
    ...item,
    last: index === arr.length - 1,
  }));
}

Page({
  data: {
    headerPaddingTop: 48,
    headerPaddingRight: 28,
    loading: true,
    searchKeyword: '',
    conversations: [],
    displayConversations: [],
    totalBadge: 0,
  },

  onLoad() {
    this.setData(readTabShellInsets());
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
    syncCurrentCustomTabBar(ctx);
    this._tenantCtx = ctx;
    this.loadMessages();
  },

  onPullDownRefresh() {
    this.loadMessages().finally(() => wx.stopPullDownRefresh());
  },

  applyFilter(conversations, searchKeyword) {
    const filtered = filterConversations(conversations, searchKeyword);
    this.setData({
      displayConversations: markLastConversation(filtered),
    });
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword });
    this.applyFilter(this.data.conversations, searchKeyword);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyFilter(this.data.conversations, '');
  },

  async loadMessages() {
    const ctx = this._tenantCtx;
    if (!ctx) return;

    this.setData({ loading: true });

    try {
      const results = await Promise.all([
        request({ path: '/dashboard/notifications?limit=50', method: 'GET' }).catch(() => []),
        request({ path: '/todos', method: 'GET' }).catch(() => []),
        request({ path: '/collaboration/subcontract-transfers?all=true', method: 'GET' }).catch(
          () => [],
        ),
      ]);
      const notifications = results[0];
      const todos = results[1];
      const transfers = results[2];

      const userId = readCurrentUserId();
      const notifList = normalizeListBody(notifications);
      const todoList = normalizeListBody(todos);
      const transferList = normalizeListBody(transfers);
      const result = buildConversations({
        notifications: notifList,
        todos: todoList,
        transfers: transferList,
        tenantId: ctx.tenantId,
        userId,
      });

      setCache({
        notifications: notifList,
        todos: todoList,
        transfers: transferList,
        tenantId: ctx.tenantId,
        userId,
        conversations: result.conversations,
      });

      const { searchKeyword } = this.data;
      this.setData({
        loading: false,
        conversations: result.conversations,
        totalBadge: result.unreadCount,
        displayConversations: markLastConversation(
          filterConversations(result.conversations, searchKeyword),
        ),
      });

      updateMessagesTabBadge(result.unreadCount);
    } catch {
      this.setData({
        loading: false,
        conversations: [],
        displayConversations: [],
        totalBadge: 0,
      });
      updateMessagesTabBadge(0);
    }
  },

  onConversationTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/pages/messages-chat/messages-chat?id=${encodeURIComponent(id)}` });
  },
});
