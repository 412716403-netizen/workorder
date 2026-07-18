const _require = require('../../config.js'),API_BASE = _require.API_BASE;
const _require2 = require('../../config/branding.js'),BRAND_NAME = _require2.BRAND_NAME,BRAND_LOGO_PATH = _require2.BRAND_LOGO_PATH,BRAND_TAGLINE = _require2.BRAND_TAGLINE;
const _require3 = require('../../utils/unsavedFormDrafts.js'),clearUnsavedFormDrafts = _require3.clearUnsavedFormDrafts;
const { clearFeaturePluginsCache } = require('../../utils/featurePlugins.js');
const { resolveDefaultTabPath } = require('../../utils/tabAccess.js');

/**
 * 与网页端 AuthContext.handleLogin 一致：
 * - 若登录结果带默认 tenantId 且企业有效，直接写入 tenantCtx 进首页
 * - 否则若有企业列表，进选择企业
 * - 否则进「暂无企业」
 */
Page({
  data: {
    brandName: BRAND_NAME,
    brandTagline: BRAND_TAGLINE,
    logoPath: BRAND_LOGO_PATH,
    username: '',
    password: '',
    loading: false,
    showPassword: false
  },

  onUser(e) {
    this.setData({ username: e.detail.value });
  },

  onPass(e) {
    this.setData({ password: e.detail.value });
  },

  onTogglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  onLogin() {
    const username = (this.data.username || '').trim();
    const password = this.data.password || '';
    if (!username || !password) {
      wx.showToast({ title: '请填写手机号或用户名和密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    wx.request({
      url: `${API_BASE}/auth/login`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { username, password, client: 'miniprogram' },
      success: (res) => {
        if (res.statusCode !== 200 || !res.data || !res.data.accessToken) {
          const msg =
          res.data && (res.data.error || res.data.message) || `登录失败 (${res.statusCode})`;
          wx.showToast({ title: String(msg).slice(0, 40), icon: 'none' });
          return;
        }

        const d = res.data;
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
          if (matched && matched.status !== 'pending' && matched.status !== 'rejected') {var _matched$expiresAt;
            wx.setStorageSync(
              'tenantCtx',
              JSON.stringify({
                tenantId: matched.id,
                tenantName: matched.name,
                tenantRole: matched.role,
                permissions: matched.permissions || [],
                status: matched.status,
                expiresAt: (_matched$expiresAt = matched.expiresAt) != null ? _matched$expiresAt : null,
                industryKind: matched.industryKind || 'generic',
                equipmentFeaturesEnabled: matched.equipmentFeaturesEnabled !== false
              })
            );
            wx.switchTab({ url: resolveDefaultTabPath({
              tenantRole: matched.role,
              permissions: matched.permissions || [],
            }) });
            return;
          }
        }

        wx.removeStorageSync('tenantCtx');

        if (tenants.length > 0) {
          wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
          return;
        }

        wx.reLaunch({ url: '/pages/no-tenant/no-tenant' });
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  }
});
