const { readTenantCtx, readCurrentUserId } = require('../../utils/session.js');
const { markRead } = require('../../utils/notificationRead.js');
const { getCache } = require('../../utils/messagesCache.js');
const { buildConversations } = require('../../utils/messagesChatBuilder.js');
const { updateMessagesTabBadge } = require('../../utils/messagesTabBadge.js');

function decodeOpt(v) {
  if (v == null || v === '') return '';
  try {
    return decodeURIComponent(String(v));
  } catch {
    return String(v);
  }
}

Page({
  data: {
    title: '',
    avatarText: '',
    avatarTone: 'muted',
    bubbles: [],
    empty: false,
  },

  onLoad(options) {
    const id = decodeOpt(options.id);
    this._conversationId = id;
    this.loadConversation(id);
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    if (this._conversationId && !this.data.bubbles.length) {
      this.loadConversation(this._conversationId);
    }
  },

  onHeaderBack() {
    wx.navigateBack();
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

    const bubbles = (conversation.bubbles || []).map((b) => ({
      ...b,
      bodyLines: b.body ? b.body.split('\n').filter(Boolean) : [],
      metaParts: this.buildMetaParts(b),
    }));

    this.setData({
      title: conversation.title,
      avatarText: conversation.avatarText,
      avatarTone: conversation.avatarTone,
      bubbles,
      empty: bubbles.length === 0,
    });

    if (conversation.kind === 'notifications') {
      const ctx = readTenantCtx();
      const userId = readCurrentUserId();
      if (ctx) {
        (conversation.bubbles || []).forEach((b) => {
          if (b.kind === 'notification' && b.id) markRead(ctx.tenantId, userId, b.id);
        });
        this.refreshTabBadge(cache);
      }
    }
  },

  buildMetaParts(b) {
    const parts = [];
    if (b.sourceLabel) parts.push(b.sourceLabel);
    if (b.sourceDocNo) parts.push(`单号 ${b.sourceDocNo}`);
    if (b.productName) parts.push(b.productName);
    if (b.quantity != null && b.quantity > 0) parts.push(`${b.quantity} 件`);
    if (b.docNo) parts.push(`单号 ${b.docNo}`);
    if (b.nextFactory) parts.push(`下一站 ${b.nextFactory}`);
    return parts;
  },

  refreshTabBadge(cache) {
    const result = buildConversations({
      notifications: cache.notifications,
      todos: cache.todos,
      transfers: cache.transfers,
      tenantId: cache.tenantId,
      userId: cache.userId,
    });
    updateMessagesTabBadge(result.unreadCount);
  },

  onBubbleTap(e) {
    const { id, kind, title, body } = e.currentTarget.dataset;
    if (kind === 'notification') {
      const ctx = readTenantCtx();
      if (ctx && id) markRead(ctx.tenantId, readCurrentUserId(), id);

      const bubbles = this.data.bubbles.map((b) =>
        b.id === id ? { ...b, read: true } : b,
      );
      this.setData({ bubbles });

      const cache = getCache();
      if (cache) this.refreshTabBadge(cache);

      wx.showModal({
        title: title || '消息详情',
        content: body || '暂无内容',
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }
    if (kind === 'todo') {
      const bubble = (this.data.bubbles || []).find((b) => b.id === id);
      const href = (bubble && bubble.href) || '';
      try {
        const { resolveTodoMiniPath } = require('../../utils/todoNavigate.js');
        const miniPath = resolveTodoMiniPath(href);
        if (miniPath) {
          wx.navigateTo({ url: miniPath });
          return;
        }
      } catch {
        // ignore
      }
      wx.showModal({
        title: title || '待办详情',
        content: body || '暂无内容',
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }
    if (kind === 'dispatch' || kind === 'return' || kind === 'agg-return' || kind === 'forward') {
      wx.showToast({ title: '请在电脑端协作管理处理', icon: 'none', duration: 2500 });
      return;
    }
  },
});
