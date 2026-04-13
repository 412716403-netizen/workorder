const { readTenants, readTenantCtx } = require('./utils/session.js');

App({
  onLaunch() {
    const token = wx.getStorageSync('accessToken');
    if (!token) return;

    const ctx = readTenantCtx();
    const tenants = readTenants();

    if (ctx && ctx.tenantId) {
      wx.reLaunch({ url: '/pages/home/home' });
      return;
    }
    if (tenants.length > 0) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    wx.reLaunch({ url: '/pages/home/home' });
  },
});
