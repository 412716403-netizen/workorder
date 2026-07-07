const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  emptyPaymentForm,
  formFromRecord,
  formVisibility,
  validatePaymentForm,
  buildPaymentSavePayload,
  buildCategoryPickerOptions,
  buildAccountPickerOptions,
  buildWorkerPickerOptions,
  initialCustomDataForCategory,
  categoriesForPayment,
} = require('../utils/financePayments.js');
const {
  getFinanceRecord,
  createFinanceRecord,
  updateFinanceRecord,
  fetchFinanceCategoriesAll,
  fetchFinanceAccountTypesAll,
  fetchFeaturePlugins,
  isFundsAccountEnabled,
  normalizeMasterList,
} = require('../../utils/financeApi.js');
const {
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
  fetchProductsAll,
  fetchCategoriesAll,
} = require('../utils/planApi.js');
const { fetchWorkersAll } = require('../utils/orderApi.js');
const { normalizeMasterList: normalizeList } = require('../utils/productionPlans.js');
const { readNavBarMetrics, readWindowMetrics, computePlanCreateHeaderHeight } = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../utils/saveNavigation.js');

function findIndexById(ids, id) {
  if (!id) return 0;
  const idx = (ids || []).indexOf(id);
  return idx >= 0 ? idx : 0;
}

Page({
  data: {
    loading: true,
    submitting: false,
    editing: false,
    title: '登记付款单',
    form: emptyPaymentForm(),
    partners: [],
    partnerCategories: [],
    products: [],
    productCategories: [],
    hasCategories: false,
    categoryNames: [],
    categoryIndex: 0,
    showPartner: true,
    needPartner: true,
    showWorker: false,
    workerNames: [],
    workerIndex: 0,
    showProduct: false,
    showPaymentAccount: false,
    accountNames: [],
    accountIndex: 0,
    customFields: [],
    canSubmit: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const ctx = readTenantCtx();
    const id = options.id ? decodeURIComponent(options.id) : '';
    const editing = Boolean(id);
    const perm = editing ? 'finance:payment:edit' : 'finance:payment:create';
    if (!hasPermission((ctx && ctx.permissions) || [], perm)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const nav = readNavBarMetrics();
    this._editingId = id;
    const win = readWindowMetrics();
    const rpx = win.windowWidth / 750;
    this.setData({
      editing,
      title: editing ? '编辑付款单' : '登记付款单',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: Math.max(
        200,
        (win.windowHeight || 667)
          - computePlanCreateHeaderHeight(nav)
          - Math.ceil(128 * rpx)
          - (win.safeAreaBottom || 0),
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
      const [
        categoriesRaw,
        accountTypesRaw,
        plugins,
        partners,
        partnerCategories,
        products,
        productCategories,
        workersRaw,
        existing,
      ] = await Promise.all([
        fetchFinanceCategoriesAll(),
        fetchFinanceAccountTypesAll(),
        fetchFeaturePlugins(),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll(),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchWorkersAll().catch(() => []),
        this._editingId ? getFinanceRecord(this._editingId) : Promise.resolve(null),
      ]);

      const categories = categoriesForPayment(normalizeMasterList(categoriesRaw));
      const accountTypes = normalizeMasterList(accountTypesRaw);
      const workers = normalizeMasterList(workersRaw);
      const fundsAccountEnabled = isFundsAccountEnabled(plugins);

      this._categories = categories;
      this._accountTypes = accountTypes;
      this._workers = workers;
      this._fundsAccountEnabled = fundsAccountEnabled;
      this._existing = existing && existing.type === 'PAYMENT' ? existing : null;

      const catOpts = buildCategoryPickerOptions(categories);
      const accOpts = buildAccountPickerOptions(accountTypes);
      const workerOpts = buildWorkerPickerOptions(workers);
      this._categoryIds = catOpts.ids;
      this._accountIds = accOpts.ids;
      this._accountNames = accOpts.names;
      this._workerIds = workerOpts.ids;

      let form = emptyPaymentForm();
      if (this._existing) {
        form = formFromRecord(this._existing);
        const cat = categories.find((c) => c.id === form.categoryId);
        form.customData = initialCustomDataForCategory(cat, form.customData);
      } else if (categories.length === 1) {
        form.categoryId = categories[0].id;
        form.customData = initialCustomDataForCategory(categories[0]);
      }

      this.setData({
        loading: false,
        form,
        partners: normalizeList(partners),
        partnerCategories: normalizeList(partnerCategories),
        products: normalizeList(products),
        productCategories: normalizeList(productCategories),
        categoryNames: catOpts.names,
        accountNames: accOpts.names,
        workerNames: workerOpts.names,
        categoryIndex: findIndexById(catOpts.ids, form.categoryId),
        accountIndex: findIndexById(
          accOpts.ids,
          (accountTypes.find((a) => a.name === form.paymentAccount) || {}).id,
        ),
        workerIndex: findIndexById(workerOpts.ids, form.workerId),
      });
      this.applyVisibility(form);
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  applyVisibility(form) {
    const visibility = formVisibility(form, this._categories, this._fundsAccountEnabled);
    const canSubmit = !validatePaymentForm(form, visibility);
    this._visibility = visibility;
    this.setData({
      hasCategories: visibility.hasCategories,
      showPartner: visibility.showPartner,
      needPartner: visibility.needPartner,
      showWorker: visibility.showWorker,
      showProduct: visibility.showProduct,
      showPaymentAccount: visibility.showPaymentAccount,
      customFields: visibility.customFields,
      canSubmit,
    });
  },

  patchForm(patch) {
    const form = { ...this.data.form, ...patch };
    this.setData({ form });
    this.applyVisibility(form);
  },

  onCategoryChange(e) {
    const idx = Number(e.detail.value);
    const categoryId = (this._categoryIds || [])[idx] || '';
    const cat = (this._categories || []).find((c) => c.id === categoryId);
    this.setData({ categoryIndex: idx >= 0 ? idx : 0, workerIndex: 0 });
    this.patchForm({
      categoryId,
      customData: initialCustomDataForCategory(cat),
      workerId: '',
      productId: '',
    });
  },

  onPartnerChange(e) {
    const detail = e.detail || {};
    this.patchForm({ partner: detail.name || detail.value || '' });
  },

  onWorkerChange(e) {
    const idx = Number(e.detail.value);
    const workerId = (this._workerIds || [])[idx] || '';
    this.setData({ workerIndex: idx >= 0 ? idx : 0 });
    this.patchForm({ workerId });
  },

  onProductChange(e) {
    const detail = e.detail || {};
    this.patchForm({ productId: detail.id || detail.value || '' });
  },

  onAccountChange(e) {
    const idx = Number(e.detail.value);
    const accountId = (this._accountIds || [])[idx] || '';
    const account = (this._accountTypes || []).find((a) => a.id === accountId);
    this.setData({ accountIndex: idx >= 0 ? idx : 0 });
    this.patchForm({ paymentAccount: account ? account.name : '' });
  },

  onCustomDataChange(e) {
    const customData = (e.detail && e.detail.customData) || {};
    this.patchForm({ customData });
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
    const visibility = this._visibility || formVisibility(form, this._categories, this._fundsAccountEnabled);
    const err = validatePaymentForm(form, visibility);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }

    const operator = readOperatorDisplayName();
    const body = buildPaymentSavePayload(form, visibility, operator, this._existing);
    this.setData({ submitting: true });

    const req = this._existing
      ? updateFinanceRecord(this._existing.id, body)
      : createFinanceRecord(body);

    req
      .then(() => {
        this.setData({ submitting: false });
        afterSaveReturnToList({
          listUrl: LIST_ROUTES.FINANCE_PAYMENTS,
          toastTitle: this._existing ? '已保存' : '登记成功',
          alsoRefreshListUrls: [LIST_ROUTES.FINANCE_PAYMENT_FLOW],
        });
      })
      .catch((e) => {
        this.setData({ submitting: false });
        wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
      });
  },
});
