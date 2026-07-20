const { API_BASE } = require('../../config.js');
const { BRAND_NAME, BRAND_LOGO_PATH, BRAND_TAGLINE } = require('../../config/branding.js');
const { applyLoginSuccess, wxLoginCode } = require('../../utils/authLogin.js');

/**
 * 与网页端 AuthContext.handleLogin 一致：
 * - 若登录结果带默认 tenantId 且企业有效，直接写入 tenantCtx 进首页
 * - 否则若有企业列表，进选择企业
 * - 否则进「暂无企业」
 * 另：支持微信一键登录；未绑定时进入「绑定并登录」模式。
 */
Page({
  data: {
    brandName: BRAND_NAME,
    brandTagline: BRAND_TAGLINE,
    logoPath: BRAND_LOGO_PATH,
    username: '',
    password: '',
    loading: false,
    wechatLoading: false,
    showPassword: false,
    /** 微信未绑定：需用账号密码完成首次绑定 */
    bindMode: false,
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

  onCancelBind() {
    this.setData({ bindMode: false });
  },

  onLogin() {
    if (this.data.bindMode) {
      this.bindAndLogin();
      return;
    }
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
            (res.data && (res.data.error || res.data.message)) || `登录失败 (${res.statusCode})`;
          wx.showToast({ title: String(msg).slice(0, 40), icon: 'none' });
          return;
        }
        applyLoginSuccess(res.data);
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      },
    });
  },

  async onWechatLogin() {
    if (this.data.loading || this.data.wechatLoading) return;
    this.setData({ wechatLoading: true });
    try {
      const code = await wxLoginCode();
      await new Promise((resolve) => {
        wx.request({
          url: `${API_BASE}/auth/wechat/miniprogram`,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code, client: 'miniprogram' },
          success: (res) => {
            if (res.statusCode === 200 && res.data && res.data.accessToken) {
              applyLoginSuccess(res.data);
              resolve();
              return;
            }
            const codeName = res.data && res.data.code;
            if (codeName === 'WECHAT_NOT_BOUND') {
              this.setData({ bindMode: true });
              wx.showToast({ title: '请先用账号密码完成绑定', icon: 'none' });
              resolve();
              return;
            }
            if (res.statusCode === 404 || res.statusCode === 502 || res.statusCode === 503) {
              const msg =
                (res.data && (res.data.error || res.data.message)) ||
                '微信登录服务未就绪，请先用账号密码登录';
              wx.showToast({ title: String(msg).slice(0, 40), icon: 'none' });
              resolve();
              return;
            }
            const msg =
              (res.data && (res.data.error || res.data.message)) || `登录失败 (${res.statusCode})`;
            wx.showToast({ title: String(msg).slice(0, 40), icon: 'none' });
            resolve();
          },
          fail: () => {
            wx.showToast({ title: '网络错误', icon: 'none' });
            resolve();
          },
        });
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '微信登录失败', icon: 'none' });
    } finally {
      this.setData({ wechatLoading: false });
    }
  },

  async bindAndLogin() {
    const username = (this.data.username || '').trim();
    const password = this.data.password || '';
    if (!username || !password) {
      wx.showToast({ title: '请填写手机号或用户名和密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const code = await wxLoginCode();
      await new Promise((resolve) => {
        wx.request({
          url: `${API_BASE}/auth/wechat/bind-and-login`,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code, username, password, client: 'miniprogram' },
          success: (res) => {
            if (res.statusCode !== 200 || !res.data || !res.data.accessToken) {
              const msg =
                (res.data && (res.data.error || res.data.message)) ||
                `绑定失败 (${res.statusCode})`;
              wx.showToast({ title: String(msg).slice(0, 40), icon: 'none' });
              resolve();
              return;
            }
            applyLoginSuccess(res.data);
            resolve();
          },
          fail: () => {
            wx.showToast({ title: '网络错误', icon: 'none' });
            resolve();
          },
        });
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '绑定失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
