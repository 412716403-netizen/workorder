const { API_BASE } = require('../../config.js');
const { request } = require('../../utils/request.js');
const { clearSession, readTenantCtx } = require('../../utils/session.js');

function roleLabel(role) {
  if (role === 'owner') return '创建者';
  if (role === 'admin') return '管理员';
  return '成员';
}

Page({
  data: {
    loading: true,
    displayName: '用户',
    user: null,
    tenantName: '',
    tenantRole: '',
    tenantRoleLabel: '',
    tenantCount: 0,
    avatarText: '用',
    menuItems: [],
  },

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
    const tenantRoleLabel = roleLabel(ctx.tenantRole || '');
    this.setData({
      tenantName: ctx.tenantName || '',
      tenantRole: ctx.tenantRole || '',
      tenantRoleLabel,
      loading: true,
    });
    this.buildMenu(ctx);
    request({ path: '/auth/me', method: 'GET' })
      .then((user) => {
        const tenants = Array.isArray(user.tenants) ? user.tenants : [];
        wx.setStorageSync('userTenants', JSON.stringify(tenants));
        const display = user.displayName || user.username || '用户';
        this.setData({
          user,
          displayName: display,
          tenantCount: tenants.length,
          avatarText: display.slice(0, 1),
          loading: false,
        });
        this.buildMenu(ctx);
      })
      .catch(() => {
        clearSession();
        wx.reLaunch({ url: '/pages/login/login' });
      });
  },

  buildMenu(ctx) {
    const icon = (name) => `/assets/mine/${name}.png`;
    const items = [
      { key: 'tenant', label: '企业与权限', desc: this.data.tenantName || ctx.tenantName || '', icon: icon('tenant'), arrow: true },
    ];
    if (this.data.tenantCount > 1) {
      items.push({ key: 'switch', label: '切换企业', desc: '', icon: icon('switch'), arrow: true });
    }
    items.push(
      { key: 'security', label: '账号与安全', desc: '', icon: icon('security'), arrow: true },
      { key: 'notify', label: '通知设置', desc: '', icon: icon('notify'), arrow: true },
      { key: 'help', label: '帮助与反馈', desc: '', icon: icon('help'), arrow: true },
      { key: 'about', label: '关于', desc: '万濮云生产报工', icon: icon('about'), arrow: true },
    );
    this.setData({ menuItems: items });
  },

  onProfileTap() {
    wx.showToast({ title: '个人资料开发中', icon: 'none' });
  },

  onMenuTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'switch') {
      this.onSwitchTenant();
      return;
    }
    if (key === 'tenant') {
      const role = this.data.tenantRoleLabel;
      wx.showModal({
        title: '企业与权限',
        content: `${this.data.tenantName}\n角色：${role || '成员'}`,
        showCancel: false,
      });
      return;
    }
    if (key === 'about') {
      wx.showModal({
        title: '关于',
        content: '万濮云 SmartTrack Pro\n生产进度节点报工系统',
        showCancel: false,
      });
      return;
    }
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  onSwitchTenant() {
    wx.removeStorageSync('tenantCtx');
    wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (!res.confirm) return;
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
  },
});
