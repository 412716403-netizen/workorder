const { readTenantCtx } = require('../../utils/session.js');
const { readTabShellInsets } = require('../../utils/tabShell.js');

Page({
  data: Object.assign({}, readTabShellInsets()),

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
  },
});
