const { readTenantCtx, readCurrentUserId } = require('../../utils/session.js');
const { applyMessageLists, loadMessagesData } = require('../../utils/messagesLoad.js');
const { getCache } = require('../../utils/messagesCache.js');
const { readTabShellInsets } = require('../../utils/tabShell.js');
const { syncCurrentCustomTabBar } = require('../../utils/tabAccess.js');
const { updateMessagesTabBadge } = require('../../utils/messagesTabBadge.js');

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

function renderConversations(page, result) {
  const { searchKeyword } = page.data;
  page.setData({
    loading: false,
    conversations: result.conversations,
    totalBadge: result.unreadCount,
    displayConversations: markLastConversation(
      filterConversations(result.conversations, searchKeyword),
    ),
  });
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
    // 先用缓存按最新已读状态刷新角标，避免返回列表时仍显示旧红点
    this.syncFromCache(ctx);
    this.loadMessages();
  },

  /** 从缓存按当前已读集合重建会话角标（即时，不依赖网络） */
  syncFromCache(ctx) {
    const cache = getCache();
    if (!cache || !cache.notifications) return;
    const result = applyMessageLists(ctx.tenantId, readCurrentUserId(), {
      notifList: cache.notifications,
      todoList: cache.todos || [],
      transferList: cache.transfers || [],
    });
    renderConversations(this, result);
  },

  onPullDownRefresh() {
    this.loadMessages({ force: true }).finally(() => wx.stopPullDownRefresh());
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

  async loadMessages(opts) {
    const ctx = this._tenantCtx;
    if (!ctx) return;

    if (!(this.data.conversations || []).length) {
      this.setData({ loading: true });
    }

    try {
      const result = await loadMessagesData(ctx.tenantId, readCurrentUserId(), opts);
      renderConversations(this, result);
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
