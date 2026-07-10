const { readTenantCtx } = require('../utils/session.js');
const { buildVisibleTabItems } = require('../utils/tabAccess.js');

function currentPagePath() {
  if (typeof getCurrentPages !== 'function') return '';
  const pages = getCurrentPages();
  const current = pages && pages[pages.length - 1];
  return current && current.route ? `/${current.route}` : '';
}

Component({
  data: {
    items: [],
    selectedPath: '',
    messageBadge: '',
  },

  lifetimes: {
    attached() {
      this.syncAccess();
    },
  },

  pageLifetimes: {
    show() {
      this.syncAccess();
    },
  },

  methods: {
    syncAccess(ctx) {
      const activeCtx = ctx || readTenantCtx();
      this.setData({
        items: buildVisibleTabItems(activeCtx),
        selectedPath: currentPagePath(),
        messageBadge: String(wx.getStorageSync('messagesTabBadge') || ''),
      });
    },

    setMessageBadge(total) {
      const n = Number(total) || 0;
      this.setData({ messageBadge: n > 99 ? '99+' : n > 0 ? String(n) : '' });
    },

    onTabTap(event) {
      const path = event.currentTarget.dataset.path;
      if (!path || path === this.data.selectedPath) return;
      wx.switchTab({ url: path });
    },
  },
});
