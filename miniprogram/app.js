const { readTenants, readTenantCtx } = require('./utils/session.js');

App({
  globalData: {
    scanPreset: null,
  },

  onLaunch() {
    const token = wx.getStorageSync('accessToken');
    if (!token) return;

    const ctx = readTenantCtx();
    const tenants = readTenants();

    if (ctx && ctx.tenantId) {
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }
    if (tenants.length > 0) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    wx.reLaunch({ url: '/pages/no-tenant/no-tenant' });
  },
});
