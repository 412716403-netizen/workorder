const { readTenantCtx } = require('../../utils/session.js');
const { buildAppCategories } = require('../../config/menus.js');

Page({
  data: {
    categories: [],
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
    const categories = buildAppCategories(ctx.permissions || [], '');
    this.setData({ categories });
  },

  onGridTap() {
    /* icon-grid 内部已 toast；预留扩展 */
  },
});
