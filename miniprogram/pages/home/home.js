const { API_BASE } = require('../../config.js');
const { request } = require('../../utils/request.js');
const { clearSession, readTenantCtx } = require('../../utils/session.js');

Page({
  data: {
    loading: true,
    user: null,
    error: '',
    tenantName: '',
    tenantCount: 0,
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    const ctx = readTenantCtx();
    this.setData({
      tenantName: ctx && ctx.tenantName ? ctx.tenantName : '',
    });

    this.setData({ loading: true, error: '' });
    request({ path: '/auth/me', method: 'GET' })
      .then((user) => {
        const tenants = Array.isArray(user.tenants) ? user.tenants : [];
        wx.setStorageSync('userTenants', JSON.stringify(tenants));

        const cur = readTenantCtx();
        if (!cur || !cur.tenantId) {
          if (tenants.length > 0) {
            wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
            return;
          }
          wx.reLaunch({ url: '/pages/no-tenant/no-tenant' });
          return;
        }

        this.setData({
          user,
          tenantCount: tenants.length,
          tenantName: cur.tenantName || '',
          loading: false,
        });
      })
      .catch(() => {
        clearSession();
        wx.reLaunch({ url: '/pages/login/login' });
      });
  },

  onSwitchTenant() {
    wx.removeStorageSync('tenantCtx');
    wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
  },

  onLogout() {
    const refresh = wx.getStorageSync('refreshToken');
    wx.request({
      url: `${API_BASE}/auth/logout`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: refresh ? { refreshToken: refresh } : {},
      complete: () => {
        clearSession();
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },
});
