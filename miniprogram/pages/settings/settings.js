const { readTenantCtx } = require('../../utils/session.js');
const { buildSettingsCategories } = require('../../config/settingsTabs.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const paddingPx = Math.ceil((win.windowWidth / 750) * 28);
  return nav.statusBarHeight + nav.navBarHeight + paddingPx;
}

Page({
  data: {
    categories: [],
    loading: true,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 64,
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

    const categories = buildSettingsCategories(ctx.permissions || [], ctx.tenantRole || '');
    this.setData({ categories, loading: false });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onTabTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (id === 'production') {
      wx.navigateTo({
        url: `/pages/settings-tab/settings-tab?id=${id}`,
        fail: () => {
          wx.showToast({ title: '打开详情失败', icon: 'none' });
        },
      });
      return;
    }
    wx.navigateTo({
      url: `/packageBusiness/settings-archive-list/settings-archive-list?id=${encodeURIComponent(id)}`,
      fail: () => {
        wx.showToast({ title: '打开详情失败', icon: 'none' });
      },
    });
  },
});
