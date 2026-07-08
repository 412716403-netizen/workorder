const { readTenantCtx } = require('../../utils/session.js');
const { buildAppCategories } = require('../../config/menus.js');
const { loadFeaturePlugins } = require('../../utils/featurePlugins.js');
const { syncTenantCtx } = require('../../utils/tenantCtxSync.js');

Page({
  data: {
    categories: [],
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    syncTenantCtx().then((ctx) => {
      const activeCtx = ctx || readTenantCtx();
      if (!activeCtx || !activeCtx.tenantId) {
        wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
        return;
      }
      loadFeaturePlugins(true).then((plugins) => {
        const categories = buildAppCategories(
          activeCtx.permissions || [],
          '',
          plugins,
          activeCtx.tenantRole || '',
        );
        this.setData({ categories });
      });
    });
  },

  onGridTap() {
    /* icon-grid 内部已 toast；预留扩展 */
  },
});
