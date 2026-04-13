const { request } = require('../../utils/request.js');
const { clearSession, readTenants } = require('../../utils/session.js');

function roleLabel(role) {
  if (role === 'owner') return '创建者';
  if (role === 'admin') return '管理员';
  return '成员';
}

function decorateTenant(t) {
  const pending = t.status === 'pending';
  const rejected = t.status === 'rejected';
  const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
  return {
    ...t,
    _roleLabel: roleLabel(t.role),
    _statusLabel: pending ? '审核中' : rejected ? '已拒绝' : expired ? '已到期' : '正常',
    _disabled: pending || rejected || expired,
  };
}

function decorateList(list) {
  return list.map(decorateTenant);
}

Page({
  data: {
    tenants: [],
    loadingId: '',
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const local = readTenants();
    this.setData({ tenants: decorateList(local) });

    request({ path: '/tenants', method: 'GET' })
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        wx.setStorageSync('userTenants', JSON.stringify(arr));
        this.setData({ tenants: decorateList(arr) });
      })
      .catch(() => {});
  },

  onOnboarding() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding?from=select' });
  },

  onTapTenant(e) {
    const id = e.currentTarget.dataset.id;
    const t = (this.data.tenants || []).find((x) => x.id === id);
    if (!id || !t || t._disabled) return;
    if (this.data.loadingId) return;

    this.setData({ loadingId: id });
    request({ path: `/tenants/${id}/select`, method: 'POST', data: {} })
      .then((d) => {
        if (d.accessToken) wx.setStorageSync('accessToken', d.accessToken);
        if (d.refreshToken) wx.setStorageSync('refreshToken', d.refreshToken);
        wx.setStorageSync(
          'tenantCtx',
          JSON.stringify({
            tenantId: d.tenantId,
            tenantName: d.tenantName,
            tenantRole: d.tenantRole,
            permissions: d.permissions || [],
            expiresAt: d.expiresAt ?? null,
          }),
        );
        wx.reLaunch({ url: '/pages/home/home' });
      })
      .catch((err) => {
        const msg = err && err.message ? err.message : '切换企业失败';
        wx.showToast({ title: String(msg).slice(0, 36), icon: 'none' });
      })
      .finally(() => {
        this.setData({ loadingId: '' });
      });
  },

  onLogout() {
    const { API_BASE } = require('../../config.js');
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
