const _require = require('../../utils/request.js'),request = _require.request;
const _require2 = require('../../utils/session.js'),clearSession = _require2.clearSession,readTenants = _require2.readTenants,parseTenantListResponse = _require2.parseTenantListResponse;
const { clearFeaturePluginsCache } = require('../../utils/featurePlugins.js');
const { resolveDefaultTabPath } = require('../../utils/tabAccess.js');

function roleLabel(role) {
  if (role === 'owner') return '创建者';
  return '成员';
}

function decorateTenant(t) {
  const pending = t.status === 'pending';
  const rejected = t.status === 'rejected';
  const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
  const disabled = pending || rejected || expired;
  let _pill = '';
  let _statusLabel = '';
  let _iconClass = '';
  if (pending) {
    _pill = 'pending';
    _statusLabel = '审核中';
    _iconClass = 'auth-flow-icon--warning';
  } else if (rejected) {
    _pill = 'rejected';
    _statusLabel = '已拒绝';
    _iconClass = 'auth-flow-icon--danger';
  } else if (expired) {
    _pill = 'rejected';
    _statusLabel = '已到期';
    _iconClass = 'auth-flow-icon--danger';
  }
  return {
    ...t,
    _roleLabel: roleLabel(t.role),
    _statusLabel,
    _pill,
    _showPill: pending || rejected || expired,
    _disabled: disabled,
    _iconClass,
    _iconChar: t.name ? t.name[0] : '企'
  };
}

function decorateList(list) {
  return list.map(decorateTenant);
}

Page({
  data: {
    tenants: [],
    loadingId: '',
    loading: false,
    refreshing: false
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const local = readTenants();
    this.setData({
      tenants: decorateList(local),
      loading: !local.length
    });
    this.loadTenants({ silent: !!local.length });
  },

  loadTenants(options = {}) {
    const silent = options.silent === true;
    if (!silent) {
      this.setData({ loading: true });
    }
    return request({ path: '/tenants?all=true', method: 'GET' }).
    then((list) => {
      const arr = parseTenantListResponse(list);
      wx.setStorageSync('userTenants', JSON.stringify(arr));
      this.setData({ tenants: decorateList(arr) });
    }).
    catch(() => {}).
    finally(() => {
      this.setData({ loading: false, refreshing: false });
    });
  },

  onRefresh() {
    this.setData({ refreshing: true });
    this.loadTenants({ silent: true });
  },

  onOnboardingCreate() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding?from=select&mode=create' });
  },

  onOnboardingJoin() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding?from=select&mode=join' });
  },

  onTapTenant(e) {
    const id = e.currentTarget.dataset.id;
    const t = (this.data.tenants || []).find((x) => x.id === id);
    if (!id || !t || t._disabled) return;
    if (this.data.loadingId) return;

    this.setData({ loadingId: id });
    request({ path: `/tenants/${id}/select`, method: 'POST', data: {} }).
    then((d) => {var _d$expiresAt;
      if (d.accessToken) wx.setStorageSync('accessToken', d.accessToken);
      if (d.refreshToken) wx.setStorageSync('refreshToken', d.refreshToken);
      clearFeaturePluginsCache();
      wx.setStorageSync(
        'tenantCtx',
        JSON.stringify({
          tenantId: d.tenantId,
          tenantName: d.tenantName,
          tenantRole: d.tenantRole,
          permissions: d.permissions || [],
          expiresAt: (_d$expiresAt = d.expiresAt) != null ? _d$expiresAt : null,
          industryKind: d.industryKind || 'generic',
          equipmentFeaturesEnabled: d.equipmentFeaturesEnabled !== false
        })
      );
      wx.switchTab({ url: resolveDefaultTabPath({
        tenantRole: d.tenantRole,
        permissions: d.permissions || [],
      }) });
    }).
    catch((err) => {
      const msg = err && err.message ? err.message : '切换企业失败';
      wx.showToast({ title: String(msg).slice(0, 36), icon: 'none' });
    }).
    finally(() => {
      this.setData({ loadingId: '' });
    });
  },

  onLogout() {
    const _require3 = require('../../config.js'),API_BASE = _require3.API_BASE;
    const refresh = wx.getStorageSync('refreshToken');
    wx.request({
      url: `${API_BASE}/auth/logout`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: refresh ? { refreshToken: refresh } : {},
      complete: () => {
        clearSession();
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  }
});
