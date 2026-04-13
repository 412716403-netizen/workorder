const { request } = require('../../utils/request.js');

function appStatusLabel(status) {
  if (status === 'PENDING') return { label: '审核中', pill: 'pending' };
  if (status === 'APPROVED') return { label: '已通过', pill: 'approved' };
  return { label: '已拒绝', pill: 'rejected' };
}

Page({
  data: {
    mode: 'choose',
    fromPage: 'notenant',
    loading: false,
    lookupLoading: false,
    createName: '',
    inviteCode: '',
    lookupResult: null,
    applications: [],
  },

  pollTimer: null,
  fromPage: 'notenant',

  onLoad(query) {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const from = query.from === 'select' ? 'select' : 'notenant';
    this.fromPage = from;
    this.setData({ fromPage: from });
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
    this.setData({ mode: 'choose', createName: '', inviteCode: '', lookupResult: null });
    this.clearPoll();
  },

  onModeCreate() {
    this.setData({ mode: 'create', createName: '' });
  },

  onModeJoin() {
    this.setData({ mode: 'join', inviteCode: '', lookupResult: null });
  },

  onCreateName(e) {
    this.setData({ createName: e.detail.value });
  },

  onInviteCode(e) {
    this.setData({ inviteCode: e.detail.value });
  },

  onBackChoose() {
    if (this.fromPage === 'select') {
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/tenant-select/tenant-select' }) });
    } else {
      wx.reLaunch({ url: '/pages/no-tenant/no-tenant' });
    }
  },

  onJoinBack() {
    this.setData({ mode: 'choose', inviteCode: '', lookupResult: null });
  },

  onBackPending() {
    this.clearPoll();
    this.setData({ mode: 'choose', applications: [] });
  },

  async refreshTenantsStorage() {
    try {
      const list = await request({ path: '/tenants', method: 'GET' });
      wx.setStorageSync('userTenants', JSON.stringify(Array.isArray(list) ? list : []));
    } catch {
      /* ignore */
    }
  },

  applySelectAndEnter(d) {
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
  },

  onSubmitCreate() {
    const name = (this.data.createName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入企业名称', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    request({ path: '/tenants', method: 'POST', data: { name } })
      .then(() => {
        this.setData({ mode: 'createDone', loading: false });
        return this.refreshTenantsStorage();
      })
      .catch((err) => {
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
    request({ path: `/tenants/lookup?code=${q}`, method: 'GET' })
      .then((res) => {
        this.setData({ lookupResult: res, lookupLoading: false });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message ? String(err.message) : '未找到企业').slice(0, 36), icon: 'none' });
        this.setData({ lookupLoading: false });
      });
  },

  onApplyJoin() {
    const r = this.data.lookupResult;
    if (!r || !r.id) return;
    this.setData({ loading: true });
    request({ path: `/tenants/${r.id}/apply`, method: 'POST', data: {} })
      .then(() => {
        this.setData({ loading: false, mode: 'pending', applications: [] });
        this.loadApplications();
        this.startPoll();
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message ? String(err.message) : '提交失败').slice(0, 36), icon: 'none' });
        this.setData({ loading: false });
      });
  },

  loadApplications() {
    return request({ path: '/tenants/my-applications', method: 'GET' })
      .then((apps) => {
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
            },
          );
        }
        return undefined;
      })
      .catch(() => {});
  },

  onShow() {
    if (this.data.mode === 'pending' && !this.pollTimer) {
      this.loadApplications();
      this.startPoll();
    }
  },
});
