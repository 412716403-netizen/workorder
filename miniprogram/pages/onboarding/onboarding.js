const _require = require('../../utils/request.js'),request = _require.request;
const { parseTenantListResponse } = require('../../utils/session.js');
const { clearFeaturePluginsCache } = require('../../utils/featurePlugins.js');
const { resolveDefaultTabPath } = require('../../utils/tabAccess.js');

function appStatusLabel(status) {
  if (status === 'PENDING') return { label: '审核中', pill: 'pending' };
  if (status === 'APPROVED') return { label: '已通过', pill: 'approved' };
  return { label: '已拒绝', pill: 'rejected' };
}

function headerTitleForMode(mode) {
  if (mode === 'create') return '创建企业';
  if (mode === 'join') return '加入企业';
  if (mode === 'pending') return '等待审核';
  if (mode === 'createDone') return '提交成功';
  return '企业入驻';
}

Page({
  data: {
    mode: 'choose',
    headerTitle: '企业入驻',
    fromPage: 'notenant',
    loading: false,
    lookupLoading: false,
    createName: '',
    inviteCode: '',
    lookupResult: null,
    lookupResultIcon: '企',
    applications: []
  },

  pollTimer: null,
  fromPage: 'notenant',

  onLoad(query) {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const from = query.from === 'select' ? 'select' : 'notenant';
    const mode = query.mode === 'create' || query.mode === 'join' ? query.mode : 'choose';
    this.fromPage = from;
    this.setData({ fromPage: from, mode, headerTitle: headerTitleForMode(mode) });
  },

  setMode(mode, extra) {
    const patch = Object.assign({ mode, headerTitle: headerTitleForMode(mode) }, extra || {});
    this.setData(patch);
  },

  onUnload() {
    this.clearPoll();
  },

  onHide() {
    this.clearPoll();
  },

  clearPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  startPoll() {
    this.clearPoll();
    this.pollTimer = setInterval(() => this.loadApplications(), 5000);
  },

  onModeChoose() {
    if (this.fromPage === 'select') {
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/tenant-select/tenant-select' }) });
      return;
    }
    this.setMode('choose', { createName: '', inviteCode: '', lookupResult: null, lookupResultIcon: '企' });
    this.clearPoll();
  },

  onModeCreate() {
    this.setMode('create', { createName: '' });
  },

  onModeJoin() {
    this.setMode('join', { inviteCode: '', lookupResult: null, lookupResultIcon: '企' });
  },

  onCreateName(e) {
    this.setData({ createName: e.detail.value });
  },

  onInviteCode(e) {
    this.setData({ inviteCode: e.detail.value, lookupResult: null, lookupResultIcon: '企' });
  },

  onBackChoose() {
    if (this.fromPage === 'select') {
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/tenant-select/tenant-select' }) });
    } else {
      wx.reLaunch({ url: '/pages/no-tenant/no-tenant' });
    }
  },

  onHeaderBack() {
    const mode = this.data.mode;
    if (mode === 'create' || mode === 'join') {
      this.onModeChoose();
      return;
    }
    this.onBackChoose();
  },

  onJoinBack() {
    if (this.fromPage === 'select') {
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/tenant-select/tenant-select' }) });
      return;
    }
    this.setMode('choose', { inviteCode: '', lookupResult: null, lookupResultIcon: '企' });
  },

  onBackPending() {
    this.clearPoll();
    this.setMode('choose', { applications: [] });
  },

  async refreshTenantsStorage() {
    try {
      const list = await request({ path: '/tenants?all=true', method: 'GET' });
      wx.setStorageSync('userTenants', JSON.stringify(parseTenantListResponse(list)));
    } catch {

      /* ignore */}
  },

  applySelectAndEnter(d) {var _d$expiresAt;
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
        expiresAt: (_d$expiresAt = d.expiresAt) != null ? _d$expiresAt : null
      })
    );
    wx.switchTab({ url: resolveDefaultTabPath({
      tenantRole: d.tenantRole,
      permissions: d.permissions || [],
    }) });
  },

  onSubmitCreate() {
    const name = (this.data.createName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入企业名称', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    request({ path: '/tenants', method: 'POST', data: { name } }).
    then(() => {
      this.setMode('createDone', { loading: false });
      return this.refreshTenantsStorage();
    }).
    catch((err) => {
      wx.showToast({ title: (err && err.message ? String(err.message) : '创建失败').slice(0, 36), icon: 'none' });
      this.setData({ loading: false });
    });
  },

  onAfterCreate() {
    if (this.fromPage === 'select') {
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/tenant-select/tenant-select' }) });
    } else {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
    }
  },

  onLookup() {
    const code = (this.data.inviteCode || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    this.setData({ lookupLoading: true, lookupResult: null });
    const q = encodeURIComponent(code);
    request({ path: `/tenants/lookup?code=${q}`, method: 'GET' }).
    then((res) => {
      const name = res && res.name ? String(res.name) : '';
      this.setData({
        lookupResult: res,
        lookupResultIcon: name ? name[0] : '企',
        lookupLoading: false,
      });
    }).
    catch((err) => {
      wx.showToast({ title: (err && err.message ? String(err.message) : '未找到企业').slice(0, 36), icon: 'none' });
      this.setData({ lookupLoading: false });
    });
  },

  onApplyJoin() {
    const r = this.data.lookupResult;
    if (!r || !r.id) return;
    this.setData({ loading: true });
    request({ path: `/tenants/${r.id}/apply`, method: 'POST', data: {} }).
    then(() => {
      this.setData({ loading: false, mode: 'pending', headerTitle: headerTitleForMode('pending'), applications: [] });
      this.loadApplications();
      this.startPoll();
    }).
    catch((err) => {
      wx.showToast({ title: (err && err.message ? String(err.message) : '提交失败').slice(0, 36), icon: 'none' });
      this.setData({ loading: false });
    });
  },

  loadApplications() {
    return request({ path: '/tenants/my-applications', method: 'GET' }).
    then((apps) => {
      const list = Array.isArray(apps) ? apps : [];
      const decorated = list.map((a) => {
        const s = appStatusLabel(a.status);
        return { ...a, _label: s.label, _pill: s.pill };
      });
      this.setData({ applications: decorated });

      const approved = list.find((a) => a.status === 'APPROVED');
      if (approved) {
        this.clearPoll();
        return request({ path: `/tenants/${approved.tenantId}/select`, method: 'POST', data: {} }).then(
          (d) => {
            this.applySelectAndEnter(d);
          }
        );
      }
      return undefined;
    }).
    catch(() => {});
  },

  onShow() {
    if (this.data.mode === 'pending' && !this.pollTimer) {
      this.loadApplications();
      this.startPoll();
    }
  }
});
