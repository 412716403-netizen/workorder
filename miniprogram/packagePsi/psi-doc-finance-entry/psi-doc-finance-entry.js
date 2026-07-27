/**
 * PSI 单据快捷登记收/付款（对齐 Web QuickFinanceRecordButton + FinanceRecordFormModal 的 partnerLocked 分支）。
 *
 * 由四类单据的新建/编辑页 navigateTo 打开，入参走 eventChannel（见 utils/psiDocFinanceEntry.js）：
 * - 单据已落库（编辑态）→ 本页直接 createFinanceRecord，回传 saved 事件
 * - 单据尚未落库（新建态）→ 本页只回传 payload，由单据页暂存、保存成功后 flush
 *
 * 合作单位由单据带入且不可改，故没有合作单位选择器。
 */

const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const {
  emptyFinanceForm,
  formVisibility,
  validateFinanceForm,
  buildFinanceSavePayload,
  buildWorkerPickerOptions,
  buildAccountSelectRows,
  initialCustomDataForCategory,
  categoriesForType,
  normalizeFinanceCategories,
} = require('../../utils/financeRecordForm.js');
const {
  psiDocFinanceMeta,
  buildPsiDocFinanceNote,
  canCreatePsiDocFinance,
} = require('../../utils/psiDocFinance.js');
const {
  createFinanceRecord,
  fetchFinanceCategoriesAll,
  fetchFinanceAccountTypesAll,
  getAccountBalances,
  fetchFeaturePlugins,
  isFundsAccountEnabled,
  normalizeMasterList,
} = require('../../utils/financeApi.js');
const {
  fetchPartnersAll,
  fetchProductsAll,
  fetchCategoriesAll,
} = require('../../utils/planApi.js');
const { fetchWorkersAll } = require('../../utils/orderApi.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { defaultEntryDate, defaultEntryTimeHm } = require('../../utils/docEntryTime.js');
const { PSI_DOC_FINANCE_INIT_EVENT } = require('../../utils/psiDocFinanceEntry.js');

function findIndexById(ids, id) {
  if (!id) return 0;
  const idx = (ids || []).indexOf(id);
  return idx >= 0 ? idx : 0;
}

Page({
  data: {
    loading: true,
    submitting: false,
    title: '登记收款单',
    submitText: '保存',
    /** true = 单据未落库，只暂存 */
    staged: false,
    partnerLabel: '客户',
    form: emptyFinanceForm(),
    products: [],
    productCategories: [],
    partners: [],
    hasCategories: false,
    categories: [],
    showPartner: true,
    showWorker: false,
    workerNames: [],
    workerIndex: 0,
    showProduct: false,
    showPaymentAccount: false,
    accounts: [],
    customFields: [],
    canSubmit: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    entryDate: '',
    entryTime: '',
    pickerSheetOpen: false,
  },

  onLoad() {
    const channel =
      typeof this.getOpenerEventChannel === 'function' ? this.getOpenerEventChannel() : null;
    if (channel && typeof channel.on === 'function') {
      channel.on(PSI_DOC_FINANCE_INIT_EVENT, (payload) => this.applyInit(payload));
    }
    // eventChannel 回调在 onLoad 之后触发，此处只备好布局
    const nav = readNavBarMetrics();
    const win = readWindowMetrics();
    const rpx = (win.windowWidth || 375) / 750;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: Math.max(
        200,
        (win.windowHeight || 667) -
          computePlanCreateHeaderHeight(nav) -
          Math.ceil(128 * rpx) -
          (win.safeAreaBottom || 0),
      ),
      entryDate: defaultEntryDate(),
      entryTime: defaultEntryTimeHm(),
    });
    // 非 navigateTo 进入（或 eventChannel 丢失）时拿不到单据上下文，别把用户留在加载态
    this._initTimer = setTimeout(() => {
      if (this._meta) return;
      wx.showToast({ title: '请从单据页进入', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }, 1500);
  },

  onUnload() {
    if (this._initTimer) clearTimeout(this._initTimer);
  },

  applyInit(payload) {
    if (this._initTimer) {
      clearTimeout(this._initTimer);
      this._initTimer = null;
    }
    const init = payload || {};
    const psiType = init.psiType || '';
    const meta = psiDocFinanceMeta(psiType);
    const ctx = readTenantCtx();
    if (!canCreatePsiDocFinance(psiType, (ctx && ctx.permissions) || [])) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._psiType = psiType;
    this._meta = meta;
    // 新建态单号只是预览值，落库单号由单据页 flush 时改写
    this._sourceDocNo = String(init.docNumber || '').trim();
    const staged = init.staged === true;
    this.setData({
      title: meta.entryLabel,
      submitText: staged ? '暂存' : '保存',
      staged,
      partnerLabel: meta.partnerLabel,
    });
    this.bootstrap(init);
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap(init) {
    this.setData({ loading: true });
    try {
      const [
        categoriesRaw,
        accountTypesRaw,
        plugins,
        products,
        productCategories,
        partners,
        workersRaw,
        balancesData,
      ] = await Promise.all([
        fetchFinanceCategoriesAll(),
        fetchFinanceAccountTypesAll(),
        fetchFeaturePlugins(),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchPartnersAll().catch(() => []),
        fetchWorkersAll().catch(() => []),
        getAccountBalances({}).catch(() => null),
      ]);

      const categories = categoriesForType(
        normalizeFinanceCategories(normalizeMasterList(categoriesRaw)),
        this._meta.financeType,
      );
      const workers = normalizeMasterList(workersRaw);
      const accounts = buildAccountSelectRows(normalizeMasterList(accountTypesRaw), balancesData);

      this._categories = categories;
      this._fundsAccountEnabled = isFundsAccountEnabled(plugins);

      const workerOpts = buildWorkerPickerOptions(workers);
      this._workerIds = workerOpts.ids;

      const form = emptyFinanceForm();
      form.partner = String((init && init.partner) || '').trim();
      form.note = buildPsiDocFinanceNote(this._psiType, this._sourceDocNo);
      if (categories.length === 1) {
        form.categoryId = categories[0].id;
        form.customData = initialCustomDataForCategory(categories[0]);
      }
      if (accounts.length === 1) {
        form.paymentAccount = accounts[0].name;
      }

      this.setData({
        loading: false,
        form,
        products: normalizeMasterList(products),
        productCategories: normalizeMasterList(productCategories),
        partners: normalizeMasterList(partners),
        categories,
        accounts,
        workerNames: workerOpts.names,
        workerIndex: findIndexById(workerOpts.ids, form.workerId),
      });
      this.applyVisibility(form);
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  applyVisibility(form) {
    const visibility = formVisibility(
      form,
      this._categories,
      this._fundsAccountEnabled,
      this._meta.financeType,
    );
    this._visibility = visibility;
    this.setData({
      hasCategories: visibility.hasCategories,
      showPartner: visibility.showPartner,
      showWorker: visibility.showWorker,
      showProduct: visibility.showProduct,
      showPaymentAccount: visibility.showPaymentAccount,
      customFields: visibility.customFields,
      canSubmit: !validateFinanceForm(form, visibility, this._meta.financeType),
    });
  },

  patchForm(patch) {
    const form = { ...this.data.form, ...patch };
    this.setData({ form });
    this.applyVisibility(form);
  },

  onCategoryChange(e) {
    const detail = e.detail || {};
    const categoryId = detail.id || detail.value || '';
    const cat = (this._categories || []).find((c) => c.id === categoryId);
    this.setData({ workerIndex: 0 });
    this.patchForm({
      categoryId,
      customData: initialCustomDataForCategory(cat),
      workerId: '',
      productId: '',
    });
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
    const detail = e.detail || {};
    this.patchForm({ paymentAccount: detail.name || detail.value || '' });
  },

  onCustomDataChange(e) {
    this.patchForm({ customData: (e.detail && e.detail.customData) || {} });
  },

  onAmountInput(e) {
    this.patchForm({ amount: e.detail.value || '' });
  },

  onNoteInput(e) {
    this.patchForm({ note: e.detail.value || '' });
  },

  onEntryDateTimeChange(e) {
    const detail = e.detail || {};
    this.setData({ entryDate: detail.date || '', entryTime: detail.time || '' });
  },

  onPickerSheetOpen() {
    this.setData({ pickerSheetOpen: true });
  },

  onPickerSheetClose() {
    this.setData({ pickerSheetOpen: false });
  },

  emitToOpener(event, detail) {
    try {
      const channel =
        typeof this.getOpenerEventChannel === 'function' ? this.getOpenerEventChannel() : null;
      if (channel && typeof channel.emit === 'function') channel.emit(event, detail);
    } catch (_) {
      // 非 navigateTo 打开或无 eventChannel
    }
  },

  onSubmit() {
    if (this.data.submitting || !this._meta) return;
    const form = this.data.form;
    const visibility =
      this._visibility ||
      formVisibility(form, this._categories, this._fundsAccountEnabled, this._meta.financeType);
    const err = validateFinanceForm(form, visibility, this._meta.financeType);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }

    const body = buildFinanceSavePayload(
      form,
      visibility,
      readOperatorDisplayName(),
      null,
      this._meta.financeType,
      {
        entryDate: this.data.entryDate,
        entryTime: this.data.entryTime,
        sourceDocNo: this._sourceDocNo,
      },
    );

    if (this.data.staged) {
      this.emitToOpener('psiDocFinanceStaged', { payload: body });
      wx.showToast({ title: `${this._meta.financeDocLabel}已暂存`, icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }

    this.setData({ submitting: true });
    createFinanceRecord(body)
      .then(() => {
        this.setData({ submitting: false });
        this.emitToOpener('psiDocFinanceSaved', { amount: body.amount });
        wx.showToast({ title: `${this._meta.financeDocLabel}已保存`, icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
      })
      .catch((e) => {
        this.setData({ submitting: false });
        wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
      });
  },
});
