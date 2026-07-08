const { readTenants, readTenantCtx, clearSession } = require('./utils/session.js');
const { syncTenantCtx } = require('./utils/tenantCtxSync.js');
const { ensureFreshAccessToken } = require('./utils/request.js');

App({
  globalData: {},

  onLaunch() {
    this.bootstrapRouting();
  },

  bootstrapRouting() {
    const token = wx.getStorageSync('accessToken');
    if (!token) return;

    ensureFreshAccessToken()
      .then((ok) => {
        if (!ok) {
          clearSession();
          wx.reLaunch({ url: '/pages/login/login' });
          return;
        }
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
      })
      .catch(() => {
        wx.reLaunch({ url: '/pages/login/login' });
      });
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) return;
    const ctx = readTenantCtx();
    if (ctx && ctx.tenantId) {
      ensureFreshAccessToken()
        .then((ok) => {
          if (ok) syncTenantCtx().catch(() => {});
        })
        .catch(() => {});
    }
  },
});
