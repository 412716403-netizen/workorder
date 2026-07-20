const { resolveDefaultTabPath } = require('./tabAccess.js');
const { clearUnsavedFormDrafts } = require('./unsavedFormDrafts.js');
const { clearFeaturePluginsCache } = require('./featurePlugins.js');

/**
 * 登录成功后写入会话并跳转（密码登录 / 微信登录共用）。
 * @param {object} d — /auth/login 或 /auth/wechat/* 成功响应
 * @returns {boolean} 是否已发起页面跳转
 */
function applyLoginSuccess(d) {
  if (!d || !d.accessToken) return false;

  clearUnsavedFormDrafts();
  clearFeaturePluginsCache();
  wx.setStorageSync('accessToken', d.accessToken);
  if (d.refreshToken) wx.setStorageSync('refreshToken', d.refreshToken);
  wx.setStorageSync('currentUser', JSON.stringify(d.user || {}));

  const tenants = Array.isArray(d.tenants) ? d.tenants : [];
  wx.setStorageSync('userTenants', JSON.stringify(tenants));

  const tenantId = d.tenantId || null;

  if (tenantId && tenants.length) {
    const matched = tenants.find((t) => t.id === tenantId);
    if (matched && matched.status !== 'pending' && matched.status !== 'rejected') {
      wx.setStorageSync(
        'tenantCtx',
        JSON.stringify({
          tenantId: matched.id,
          tenantName: matched.name,
          tenantRole: matched.role,
          permissions: matched.permissions || [],
          status: matched.status,
          expiresAt: matched.expiresAt != null ? matched.expiresAt : null,
          industryKind: matched.industryKind || 'generic',
          equipmentFeaturesEnabled: matched.equipmentFeaturesEnabled !== false,
        }),
      );
      wx.switchTab({
        url: resolveDefaultTabPath({
          tenantRole: matched.role,
          permissions: matched.permissions || [],
        }),
      });
      return true;
    }
  }

  wx.removeStorageSync('tenantCtx');

  if (tenants.length > 0) {
    wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
    return true;
  }

  wx.reLaunch({ url: '/pages/no-tenant/no-tenant' });
  return true;
}

/**
 * @returns {Promise<string>} wx.login 得到的 code
 */
function wxLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code);
        else reject(new Error('未获取到微信登录凭证'));
      },
      fail: (err) => reject(err || new Error('wx.login 失败')),
    });
  });
}

module.exports = {
  applyLoginSuccess,
  wxLoginCode,
};
