const { readTenantCtx } = require('../../utils/session.js');
const {
  hasAccountTypePerm,
  mapAccountTypeRow,
  validateAccountTypeForm,
  buildAccountTypePayload,
  toDateYmd,
} = require('../utils/financeAccounts.js');
const { financeAccountTypes } = require('../../utils/settingsApi.js');
const { normalizeMasterList } = require('../../utils/financeApi.js');
const { readNavBarMetrics } = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, markListRoutesRefreshOnShow } = require('../../utils/saveNavigation.js');

function emptyForm() {
  return { name: '', initialBalance: '', openingDate: '', accountKind: '' };
}

Page({
  data: {
    loading: true,
    submitting: false,
    rows: [],
    canCreate: false,
    canEdit: false,
    canDelete: false,
    /** 空串=新增模式；否则为正在编辑的账户 id */
    editingId: '',
    form: emptyForm(),
    formTitle: '新增账户',
    showForm: false,
    statusBarHeight: 20,
    navBarHeight: 44
  },

  onLoad() {
    const ctx = readTenantCtx();
    const role = ctx && ctx.tenantRole;
    const perms = ctx && ctx.permissions;
    if (!ctx || !ctx.tenantId || !hasAccountTypePerm(role, perms, 'view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      canCreate: hasAccountTypePerm(role, perms, 'create'),
      canEdit: hasAccountTypePerm(role, perms, 'edit'),
      canDelete: hasAccountTypePerm(role, perms, 'delete')
    });
    this.reloadList();
  },

  onPullDownRefresh() {
    this.reloadList().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async reloadList() {
    this.setData({ loading: true });
    try {
      const list = normalizeMasterList(await financeAccountTypes.fetchAll());
      this._accountTypes = list;
      this.setData({ loading: false, rows: list.map(mapAccountTypeRow) });
    } catch (err) {
      this.setData({ loading: false, rows: [] });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 余额页与收付款表单的账户选项依赖此档案，改动后标记相关列表回显刷新 */
  markAccountsChanged() {
    markListRoutesRefreshOnShow([
      LIST_ROUTES.FINANCE_ACCOUNTS,
      LIST_ROUTES.FINANCE_ACCOUNT_FLOW,
    ]);
  },

  onAddTap() {
    if (!this.data.canCreate) return;
    this.setData({ showForm: true, editingId: '', formTitle: '新增账户', form: emptyForm() });
  },

  onEditTap(e) {
    if (!this.data.canEdit) return;
    const id = e.currentTarget.dataset.id;
    const acc = (this._accountTypes || []).find((a) => a.id === id);
    if (!acc) return;
    this.setData({
      showForm: true,
      editingId: id,
      formTitle: '编辑账户',
      form: {
        name: acc.name || '',
        initialBalance: acc.initialBalance != null ? String(acc.initialBalance) : '',
        openingDate: toDateYmd(acc.openingDate),
        accountKind: acc.accountKind || ''
      }
    });
  },

  onFormCancel() {
    this.setData({ showForm: false, editingId: '', form: emptyForm() });
  },

  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value || '' });
  },

  onInitialBalanceInput(e) {
    this.setData({ 'form.initialBalance': e.detail.value || '' });
  },

  onOpeningDateChange(e) {
    this.setData({ 'form.openingDate': (e.detail && e.detail.value) || '' });
  },

  onAccountKindInput(e) {
    this.setData({ 'form.accountKind': e.detail.value || '' });
  },

  onFormSubmit() {
    if (this.data.submitting) return;
    const editingId = this.data.editingId;
    const err = validateAccountTypeForm(this.data.form, this._accountTypes, editingId);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const payload = buildAccountTypePayload(this.data.form);
    this.setData({ submitting: true });
    const req = editingId
      ? financeAccountTypes.update(editingId, payload)
      : financeAccountTypes.create(payload);
    req
      .then(() => {
        this.setData({ submitting: false, showForm: false, editingId: '', form: emptyForm() });
        wx.showToast({ title: editingId ? '已保存' : '已添加', icon: 'success' });
        this.markAccountsChanged();
        this.reloadList();
      })
      .catch((e) => {
        this.setData({ submitting: false });
        wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' });
      });
  },

  onDeleteTap(e) {
    if (!this.data.canDelete || this.data.submitting) return;
    const id = e.currentTarget.dataset.id;
    const acc = (this._accountTypes || []).find((a) => a.id === id);
    if (!acc) return;
    wx.showModal({
      title: '删除账户',
      content: `确定删除账户"${acc.name}"？已归属该账户的历史流水将变为未归账。`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        financeAccountTypes.delete(id)
          .then(() => {
            this.setData({ submitting: false });
            if (this.data.editingId === id) this.onFormCancel();
            wx.showToast({ title: '已删除', icon: 'success' });
            this.markAccountsChanged();
            this.reloadList();
          })
          .catch((err) => {
            this.setData({ submitting: false });
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          });
      }
    });
  }
});
