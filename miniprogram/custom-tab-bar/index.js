const { readTenantCtx } = require('../utils/session.js');
const { buildVisibleTabItems } = require('../utils/tabAccess.js');
const { HOME_TAB_PATH, markExplicitHomeTabNav } = require('../utils/customTabBarNav.js');

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
      if (typeof wx.nextTick === 'function') {
        wx.nextTick(() => this.syncAccess());
      } else {
        this.syncAccess();
      }
    },
  },

  methods: {
    syncAccess(ctx) {
      const activeCtx = ctx || readTenantCtx();
      const items = buildVisibleTabItems(activeCtx);
      const widthPercent = items.length > 0 ? 100 / items.length : 20;
      this.setData({
        items: items.map((item) => ({
          key: item.key,
          text: item.text,
          path: item.path,
          iconPath: item.iconPath,
          selectedIconPath: item.selectedIconPath,
          widthPercent,
        })),
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
      if (!path) return;

      if (path === HOME_TAB_PATH) {
        markExplicitHomeTabNav();
      }

      wx.switchTab({
        url: path,
        success: () => {
          this.setData({ selectedPath: path });
        },
        fail: (err) => {
          console.error('[custom-tab-bar] switchTab failed', path, err);
          wx.reLaunch({
            url: path,
            fail: () => wx.showToast({ title: '页面切换失败', icon: 'none' }),
          });
        },
      });
    },
  },
});
