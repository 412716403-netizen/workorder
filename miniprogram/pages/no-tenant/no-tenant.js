const { API_BASE } = require('../../config.js');
const { clearSession } = require('../../utils/session.js');

Page({
  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onOnboardingCreate() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding?from=notenant&mode=create' });
  },

  onOnboardingJoin() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding?from=notenant&mode=join' });
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
