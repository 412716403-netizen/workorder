const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  validateTransferForm,
  buildAccountSelectRows,
} = require('../utils/financeAccounts.js');
const {
  createAccountTransfer,
  updateAccountTransfer,
  deleteAccountTransfer,
  fetchFinanceAccountTypesAll,
  getAccountBalances,
  normalizeMasterList,
} = require('../../utils/financeApi.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');

Page({
  data: {
    loading: true,
    submitting: false,
    editing: false,
    title: '账户转账',
    canDelete: false,
    form: { fromAccountId: '', toAccountId: '', amount: '', note: '' },
    accounts: [],
    canSubmit: false,
    pickerSheetOpen: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const ctx = readTenantCtx();
    const groupId = options.groupId ? decodeURIComponent(options.groupId) : '';
    const editing = Boolean(groupId);
    const perm = editing ? 'finance:transfer:edit' : 'finance:transfer:create';
    const permissions = (ctx && ctx.permissions) || [];
    if (!hasPermission(permissions, perm)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._groupId = groupId;
    const nav = readNavBarMetrics();
    const win = readWindowMetrics();
    const rpx = win.windowWidth / 750;
    this.setData({
      editing,
      title: editing ? '编辑账户转账' : '账户转账',
      canDelete: editing && hasPermission(permissions, 'finance:transfer:delete'),
      form: {
        fromAccountId: options.fromAccountId ? decodeURIComponent(options.fromAccountId) : '',
        toAccountId: options.toAccountId ? decodeURIComponent(options.toAccountId) : '',
        amount: options.amount ? decodeURIComponent(options.amount) : '',
        note: options.note ? decodeURIComponent(options.note) : '',
      },
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: Math.max(
        200,
        (win.windowHeight || 667) -
          computePlanCreateHeaderHeight(nav) -
          Math.ceil(128 * rpx) -
          (win.safeAreaBottom || 0)
      ),
    });
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [accountTypesRaw, balancesData] = await Promise.all([
        fetchFinanceAccountTypesAll(),
        getAccountBalances({}).catch(() => null),
      ]);
      const accountTypes = normalizeMasterList(accountTypesRaw);
      const accounts = buildAccountSelectRows(accountTypes, balancesData);
      const form = { ...this.data.form };
      this.setData({
        loading: false,
        accounts,
        form,
      });
      this.refreshCanSubmit(form);
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  refreshCanSubmit(form) {
    this.setData({ canSubmit: !validateTransferForm(form) });
  },

  patchForm(patch) {
    const form = { ...this.data.form, ...patch };
    this.setData({ form });
    this.refreshCanSubmit(form);
  },

  onFromChange(e) {
    const detail = e.detail || {};
    this.patchForm({ fromAccountId: detail.id || detail.value || '' });
  },

  onToChange(e) {
    const detail = e.detail || {};
    this.patchForm({ toAccountId: detail.id || detail.value || '' });
  },

  onPickerSheetOpen() {
    this.setData({ pickerSheetOpen: true });
  },

  onPickerSheetClose() {
    this.setData({ pickerSheetOpen: false });
  },

  onAmountInput(e) {
    this.patchForm({ amount: e.detail.value || '' });
  },

  onNoteInput(e) {
    this.patchForm({ note: e.detail.value || '' });
  },

  onSubmit() {
    if (this.data.submitting) return;
    const form = this.data.form;
    const err = validateTransferForm(form);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const body = {
      fromAccountId: form.fromAccountId,
      toAccountId: form.toAccountId,
      amount: Number(form.amount),
      note: (form.note || '').trim() || undefined,
      operator: readOperatorDisplayName() || undefined,
    };
    this.setData({ submitting: true });
    const req = this._groupId
      ? updateAccountTransfer(this._groupId, body)
      : createAccountTransfer(body);
    req
      .then(() => {
        this.setData({ submitting: false });
        afterSaveReturnToList({
          listUrl: LIST_ROUTES.FINANCE_ACCOUNTS,
          toastTitle: this._groupId ? '转账已更新' : '转账成功',
          alsoRefreshListUrls: [LIST_ROUTES.FINANCE_ACCOUNT_FLOW],
        });
      })
      .catch((e) => {
        this.setData({ submitting: false });
        wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
      });
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._groupId || this.data.submitting) return;
    wx.showModal({
      title: '删除转账',
      content: '将成对删除转出与转入两条流水，确定删除？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        deleteAccountTransfer(this._groupId)
          .then(() => {
            this.setData({ submitting: false });
            afterSaveReturnToList({
              listUrl: LIST_ROUTES.FINANCE_ACCOUNTS,
              toastTitle: '转账已删除',
              alsoRefreshListUrls: [LIST_ROUTES.FINANCE_ACCOUNT_FLOW],
            });
          })
          .catch((e) => {
            this.setData({ submitting: false });
            wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
          });
      },
    });
  },
});
