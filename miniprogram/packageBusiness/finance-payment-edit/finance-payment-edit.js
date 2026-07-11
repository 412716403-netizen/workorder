const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx,readOperatorDisplayName = _require.readOperatorDisplayName;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =










  require('../utils/financePayments.js'),emptyPaymentForm = _require3.emptyPaymentForm,formFromRecord = _require3.formFromRecord,formVisibility = _require3.formVisibility,validatePaymentForm = _require3.validatePaymentForm,buildPaymentSavePayload = _require3.buildPaymentSavePayload,buildCategoryPickerOptions = _require3.buildCategoryPickerOptions,buildAccountPickerOptions = _require3.buildAccountPickerOptions,buildWorkerPickerOptions = _require3.buildWorkerPickerOptions,initialCustomDataForCategory = _require3.initialCustomDataForCategory,categoriesForPayment = _require3.categoriesForPayment;
const _require4 =








  require('../../utils/financeApi.js'),getFinanceRecord = _require4.getFinanceRecord,createFinanceRecord = _require4.createFinanceRecord,updateFinanceRecord = _require4.updateFinanceRecord,fetchFinanceCategoriesAll = _require4.fetchFinanceCategoriesAll,fetchFinanceAccountTypesAll = _require4.fetchFinanceAccountTypesAll,fetchFeaturePlugins = _require4.fetchFeaturePlugins,isFundsAccountEnabled = _require4.isFundsAccountEnabled,normalizeMasterList = _require4.normalizeMasterList;
const _require5 =




  require('../utils/planApi.js'),fetchPartnersAll = _require5.fetchPartnersAll,fetchPartnerCategoriesAll = _require5.fetchPartnerCategoriesAll,fetchProductsAll = _require5.fetchProductsAll,fetchCategoriesAll = _require5.fetchCategoriesAll;
const _require6 = require('../utils/orderApi.js'),fetchWorkersAll = _require6.fetchWorkersAll;
const _require7 = require('../utils/productionPlans.js'),normalizeList = _require7.normalizeMasterList;
const _require8 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require8.readNavBarMetrics,readWindowMetrics = _require8.readWindowMetrics,computePlanCreateHeaderHeight = _require8.computePlanCreateHeaderHeight;
const _require9 = require('../utils/saveNavigation.js'),LIST_ROUTES = _require9.LIST_ROUTES,afterSaveReturnToList = _require9.afterSaveReturnToList;
const { applyPartnerCreatedOnPage } = require('../utils/mergePartnerList.js');

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
    scrollHeight: 500
  },

  onLoad(options) {
    const ctx = readTenantCtx();
    const id = options.id ? decodeURIComponent(options.id) : '';
    const editing = Boolean(id);
    const perm = editing ? 'finance:payment:edit' : 'finance:payment:create';
    if (!hasPermission(ctx && ctx.permissions || [], perm)) {
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
        (win.windowHeight || 667) -
        computePlanCreateHeaderHeight(nav) -
        Math.ceil(128 * rpx) - (
        win.safeAreaBottom || 0)
      )
    });
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all =









        await Promise.all([
        fetchFinanceCategoriesAll(),
        fetchFinanceAccountTypesAll(),
        fetchFeaturePlugins(),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll(),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchWorkersAll().catch(() => []),
        this._editingId ? getFinanceRecord(this._editingId) : Promise.resolve(null)]
        ),categoriesRaw = _await$Promise$all[0],accountTypesRaw = _await$Promise$all[1],plugins = _await$Promise$all[2],partners = _await$Promise$all[3],partnerCategories = _await$Promise$all[4],products = _await$Promise$all[5],productCategories = _await$Promise$all[6],workersRaw = _await$Promise$all[7],existing = _await$Promise$all[8];

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
          (accountTypes.find((a) => a.name === form.paymentAccount) || {}).id
        ),
        workerIndex: findIndexById(workerOpts.ids, form.workerId)
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
      canSubmit
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
      productId: ''
    });
  },

  onPartnerChange(e) {
    const detail = e.detail || {};
    this.patchForm({ partner: detail.name || detail.value || '' });
  },

  onPartnerCreated(e) {
    applyPartnerCreatedOnPage(this, e);
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
    const customData = e.detail && e.detail.customData || {};
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

    const req = this._existing ?
    updateFinanceRecord(this._existing.id, body) :
    createFinanceRecord(body);

    req.
    then(() => {
      this.setData({ submitting: false });
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.FINANCE_PAYMENTS,
        toastTitle: this._existing ? '已保存' : '登记成功',
        alsoRefreshListUrls: [LIST_ROUTES.FINANCE_PAYMENT_FLOW]
      });
    }).
    catch((e) => {
      this.setData({ submitting: false });
      wx.showToast({ title: e && e.message || '保存失败', icon: 'none' });
    });
  }
});