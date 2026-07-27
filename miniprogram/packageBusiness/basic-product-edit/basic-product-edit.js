const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  fetchProductsAll,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  fetchVariantUsage,
  fetchProductCodeRules,
} = require('../utils/productApi.js');
const {
  fetchCategoriesAll,
  fetchDictionaries,
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
} = require('../../utils/planApi.js');
const { createDictionaryItem } = require('../utils/dictionaryApi.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');
const { applyPartnerCreatedOnPage } = require('../../utils/mergePartnerList.js');
const { chooseProductImageAsDataUrl } = require('../utils/fileBase64.js');
const {
  writeLastUnitForCategory,
  resolveDefaultUnitForNewProductCategory,
} = require('../utils/productLastUnitByCategory.js');
const { productColorSizeEnabled } = require('../utils/productColorSize.js');
const { clearUnsavedFormDrafts } = require('../../utils/unsavedFormDrafts.js');
const {
  buildEmptyProduct,
  syncVariantsIfNeeded,
  prepareProductForSave,
  buildCategoryCustomFieldsForForm,
  applyCategoryCustomFieldValue,
  generateVariants,
} = require('../utils/productForm.js');
const { normalizeProductCodeRuleMap } = require('../utils/productCodeRule.js');
const { createProductCodeAutoFill } = require('../utils/productCodeAutoFill.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function findPartnerName(partners, supplierId) {
  if (!supplierId) return '';
  const p = (partners || []).find((x) => x.id === supplierId);
  return p ? p.name : '';
}

Page({
  data: {
    loading: true,
    submitting: false,
    pageTitle: '编辑产品',
    isPersisted: false,
    canDelete: false,
    form: {},
    categoryOptions: [],
    unitName: '',
    canQuickAddUnit: false,
    canQuickAddDict: false,
    supplierName: '',
    customFields: [],
    showSalesPrice: false,
    showPurchasePrice: false,
    showSupplier: false,
    showColorSize: false,
    autoCodeActive: false,
    namePlaceholder: '请填写',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    pickerSheetOpen: false,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
    this._productId = options.id ? decodeURIComponent(options.id) : '';
    this._initialized = false;
    this._codeAutoFill = createProductCodeAutoFill({
      onFill: (code, prevAutoCode) => {
        if (!this._workingProduct || this._productId) return;
        const cur = String(this._workingProduct.name || '').trim();
        // 竞态兜底：请求飞行中被手改则不覆盖
        if (cur && cur !== prevAutoCode && cur !== code) return;
        this._workingProduct.name = code;
        this.setData({
          'form.name': code,
          autoCodeActive: true,
          namePlaceholder: '按编号规则自动生成',
        });
      },
    });
    if (!this._productId) {
      clearUnsavedFormDrafts();
    }
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
    if (!hasPermission(ctx.permissions || [], 'basic:products:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    this.setData({
      canDelete: hasPermission(ctx.permissions || [], 'basic:products:delete'),
    });
    if (this._clearedOnHide) {
      this._clearedOnHide = false;
      this.bootstrap();
      return;
    }
    if (!this._initialized) {
      this.bootstrap();
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onHide() {
    this._clearedOnHide = true;
    clearUnsavedFormDrafts();
  },

  onUnload() {
    if (this._codeAutoFill) this._codeAutoFill.dispose();
    clearUnsavedFormDrafts();
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      if (this._codeAutoFill) this._codeAutoFill.reset();

      const results = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchDictionaries(),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll(),
        fetchProductCodeRules(),
      ]);
      const products = results[0];
      const categories = results[1];
      const dictionariesRaw = results[2];
      const partners = results[3];
      const partnerCategories = results[4];
      const rulesRaw = results[5];

      this._products = products || [];
      this._categories = categories || [];
      this._dictionaries = normalizeAppDictionaries(dictionariesRaw);
      this._partners = partners || [];
      this._partnerCategories = partnerCategories || [];

      if (this._codeAutoFill) {
        this._codeAutoFill.setRules(normalizeProductCodeRuleMap(rulesRaw));
      }
      this.syncAutoCodeMasterData();

      let product;
      if (this._productId) {
        product = await getProduct(this._productId);
        if (!product) {
          wx.showToast({ title: '产品不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
      } else {
        const defaultCategoryId = (categories[0] && categories[0].id) || '';
        product = buildEmptyProduct(defaultCategoryId);
      }

      this._workingProduct = JSON.parse(JSON.stringify(product));
      this._originalProduct = this._productId ? product : null;
      this.applyUiFromWorking();
      this.scheduleAutoCode();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  isNewRecord() {
    return !this._productId;
  },

  syncAutoCodeUi() {
    if (!this._codeAutoFill || !this._workingProduct) {
      this.setData({ autoCodeActive: false, namePlaceholder: '请填写' });
      return;
    }
    const state = this._codeAutoFill.getAutoState(this._workingProduct, this.isNewRecord());
    this.setData({
      autoCodeActive: this._codeAutoFill.isAutoCodeActive(
        this._workingProduct,
        this.isNewRecord(),
      ),
      namePlaceholder: state.autoMode ? '按编号规则自动生成' : '请填写',
    });
  },

  /** 编号规则可含「合作单位」元素，取号前需把最新分类/合作单位清单交给取号器 */
  syncAutoCodeMasterData() {
    if (!this._codeAutoFill) return;
    this._codeAutoFill.setMasterData({
      categories: this._categories || [],
      partners: this._partners || [],
    });
  },

  scheduleAutoCode() {
    if (!this._codeAutoFill || !this._workingProduct) return;
    this._codeAutoFill.schedule(this._workingProduct, this.isNewRecord());
    this.syncAutoCodeUi();
  },

  onRefreshAutoCode() {
    if (!this._codeAutoFill || !this._workingProduct || !this.isNewRecord()) return;
    this._codeAutoFill.refresh(this._workingProduct, true);
    this.syncAutoCodeUi();
  },

  applyUiFromWorking() {
    const product = this._workingProduct;
    const category = (this._categories || []).find((c) => c.id === product.categoryId);
    const synced = syncVariantsIfNeeded(product, category, this._dictionaries);
    if (synced !== product) this._workingProduct = synced;

    const categoryOptions = (this._categories || []).map((c) => ({
      id: c.id,
      name: c.name,
      selected: c.id === product.categoryId,
    }));
    const units = (this._dictionaries && this._dictionaries.units) || [];
    const unitIdx = units.findIndex((u) => u.id === product.unitId);
    const unitName = unitIdx >= 0 ? units[unitIdx].name : '';

    const customFields = buildCategoryCustomFieldsForForm(category, this._workingProduct).map((f) => {
      let pickerIndex = 0;
      if (f.type === 'select' && f.options.length) {
        const idx = f.options.indexOf(f.value);
        pickerIndex = idx >= 0 ? idx : 0;
      }
      return { ...f, pickerIndex };
    });

    const autoState =
      this._codeAutoFill &&
      this._codeAutoFill.getAutoState(this._workingProduct, this.isNewRecord());
    const autoMode = !!(autoState && autoState.autoMode);
    const autoCodeActive = !!(
      this._codeAutoFill &&
      this._codeAutoFill.isAutoCodeActive(this._workingProduct, this.isNewRecord())
    );

    this.setData({
      loading: false,
      pageTitle: this._productId ? '编辑产品' : '创建产品',
      isPersisted: !!this._productId,
      form: {
        id: this._workingProduct.id,
        name: this._workingProduct.name || '',
        sku: this._workingProduct.sku || '',
        imageUrl: this._workingProduct.imageUrl || this._workingProduct.imageThumb || '',
        colorIds: this._workingProduct.colorIds || [],
        sizeIds: this._workingProduct.sizeIds || [],
        salesPriceText:
          this._workingProduct.salesPrice != null ? String(this._workingProduct.salesPrice) : '',
        purchasePriceText:
          this._workingProduct.purchasePrice != null
            ? String(this._workingProduct.purchasePrice)
            : '',
        unitId: this._workingProduct.unitId || '',
      },
      categoryOptions,
      unitName,
      canQuickAddUnit: hasPermission(
        (this._tenantCtx && this._tenantCtx.permissions) || [],
        'basic:dictionaries:create',
      ),
      canQuickAddDict: hasPermission(
        (this._tenantCtx && this._tenantCtx.permissions) || [],
        'basic:dictionaries:create',
      ),
      supplierName: findPartnerName(this._partners, this._workingProduct.supplierId),
      customFields,
      showSalesPrice: !!(category && category.hasSalesPrice),
      showPurchasePrice: !!(category && category.hasPurchasePrice),
      showSupplier: !!(category && category.linkPartner),
      showColorSize: !!(category && category.hasColorSize),
      partners: this._partners,
      partnerCategories: this._partnerCategories,
      dictionaries: this._dictionaries,
      autoCodeActive,
      namePlaceholder: autoMode ? '按编号规则自动生成' : '请填写',
    });
  },

  getActiveCategory() {
    return (this._categories || []).find((c) => c.id === this._workingProduct.categoryId);
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    const cat = (this._categories || []).find((c) => c.id === id);
    if (!cat || cat.id === this._workingProduct.categoryId) return;
    this._workingProduct = {
      ...this._workingProduct,
      categoryId: cat.id,
      colorIds: cat.hasColorSize ? this._workingProduct.colorIds || [] : [],
      sizeIds: cat.hasColorSize ? this._workingProduct.sizeIds || [] : [],
      variants: cat.hasColorSize ? this._workingProduct.variants || [] : [],
    };
    if (!this._productId) {
      const unitIds = new Set(
        ((this._dictionaries && this._dictionaries.units) || []).map((u) => u.id),
      );
      const preferred = resolveDefaultUnitForNewProductCategory(
        this._tenantCtx && this._tenantCtx.tenantId,
        cat.id,
        this._products,
        unitIds,
      );
      if (preferred) this._workingProduct.unitId = preferred;
    }
    this.applyUiFromWorking();
    this.scheduleAutoCode();
  },

  onNameInput(e) {
    this._workingProduct.name = e.detail.value || '';
    this.setData({ 'form.name': this._workingProduct.name });
    this.syncAutoCodeUi();
    // 清空后恢复自动取号
    if (!String(this._workingProduct.name || '').trim()) {
      this.scheduleAutoCode();
    }
  },

  onSkuInput(e) {
    this._workingProduct.sku = e.detail.value || '';
    this.setData({ 'form.sku': this._workingProduct.sku });
    this.scheduleAutoCode();
  },

  onUnitChange(e) {
    const detail = e.detail || {};
    const unitId = detail.id || '';
    const unitName = detail.name || '';
    this._workingProduct.unitId = unitId || undefined;
    if (!this._productId && unitId) {
      writeLastUnitForCategory(
        this._tenantCtx && this._tenantCtx.tenantId,
        this._workingProduct.categoryId,
        unitId,
      );
    }
    this.setData({
      unitName,
      'form.unitId': unitId,
    });
  },

  onUnitsUpdated(e) {
    const unit = e.detail && e.detail.unit;
    if (!unit || !unit.id) return;
    const units = [...((this._dictionaries && this._dictionaries.units) || [])];
    if (!units.some((u) => u.id === unit.id)) units.push(unit);
    this._dictionaries = { ...this._dictionaries, units };
    this.setData({ dictionaries: this._dictionaries });
  },

  onSalesPriceInput(e) {
    const text = e.detail.value || '';
    this._workingProduct.salesPrice = text === '' ? undefined : Number(text);
    this.setData({ 'form.salesPriceText': text });
  },

  onPurchasePriceInput(e) {
    const text = e.detail.value || '';
    this._workingProduct.purchasePrice = text === '' ? undefined : Number(text);
    this.setData({ 'form.purchasePriceText': text });
  },

  onSupplierChange(e) {
    const detail = e.detail || {};
    this._workingProduct.supplierId = detail.id || undefined;
    this.setData({ supplierName: detail.name || '' });
    this.scheduleAutoCode();
  },

  onPartnerCreated(e) {
    applyPartnerCreatedOnPage(this, e, { cacheKey: '_partners' });
    this.syncAutoCodeMasterData();
  },

  onCustomFieldInput(e) {
    const id = e.currentTarget.dataset.id;
    this._workingProduct = applyCategoryCustomFieldValue(
      this._workingProduct,
      id,
      e.detail.value || '',
    );
    this.applyUiFromWorking();
    this.scheduleAutoCode();
  },

  onCustomSelectChange(e) {
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.detail.value) || 0;
    const field = (this.data.customFields || []).find((f) => f.id === id);
    const value = field && field.options ? field.options[idx] || '' : '';
    this._workingProduct = applyCategoryCustomFieldValue(this._workingProduct, id, value);
    this.applyUiFromWorking();
    this.scheduleAutoCode();
  },

  async onPickImage() {
    try {
      const dataUrl = await chooseProductImageAsDataUrl();
      if (!dataUrl) return;
      this._workingProduct.imageUrl = dataUrl;
      this._workingProduct.imageThumb = null;
      this.setData({ 'form.imageUrl': dataUrl });
    } catch {
      wx.showToast({ title: '图片读取失败', icon: 'none' });
    }
  },

  onClearImage() {
    this._workingProduct.imageUrl = '';
    this._workingProduct.imageThumb = null;
    this.setData({ 'form.imageUrl': '' });
  },

  async onColorSizeChange(e) {
    const detail = e.detail || {};
    const kind = detail.kind;
    const ids = detail.ids;
    const key = kind === 'color' ? 'colorIds' : 'sizeIds';
    const prev = this._workingProduct[key] || [];
    const removed = prev.filter((id) => !(ids || []).includes(id));
    if (removed.length && this._productId) {
      const allowed = await this.checkSpecRemoval(kind, removed);
      if (!allowed) return;
    }
    this._workingProduct[key] = ids || [];
    const category = this.getActiveCategory();
    if (productColorSizeEnabled(this._workingProduct, category) || (ids && ids.length)) {
      this._workingProduct.variants = generateVariants(
        this._workingProduct.colorIds,
        this._workingProduct.sizeIds,
        this._workingProduct.variants,
        this._dictionaries,
      );
    } else {
      this._workingProduct.variants = [];
    }
    this.applyUiFromWorking();
  },

  async checkSpecRemoval(kind, removedIds) {
    const variantKey = kind === 'color' ? 'colorId' : 'sizeId';
    for (let i = 0; i < removedIds.length; i += 1) {
      const specId = removedIds[i];
      const affectedIds = (this._workingProduct.variants || [])
        .filter((v) => v[variantKey] === specId)
        .map((v) => v.id);
      if (!affectedIds.length) continue;
      try {
        const res = await fetchVariantUsage(this._workingProduct.id, affectedIds);
        const blocked = (res.usages || []).filter((u) => u.total > 0);
        if (blocked.length) {
          wx.showToast({ title: '该规格已有业务数据，无法删除', icon: 'none' });
          return false;
        }
      } catch {
        // backend fallback
      }
    }
    return true;
  },

  async onColorSizeQuickAdd(e) {
    const detail = e.detail || {};
    const kind = detail.kind;
    const name = detail.name;
    const pendingIds = detail.pendingIds;
    if (!name) return;
    const dictType = kind === 'color' ? 'color' : 'size';
    try {
      const created = await createDictionaryItem({
        type: dictType,
        name,
        value: kind === 'color' ? '#ccc' : name,
      });
      const raw = await fetchDictionaries();
      this._dictionaries = normalizeAppDictionaries(raw);
      const key = kind === 'color' ? 'colorIds' : 'sizeIds';
      const baseIds = Array.isArray(pendingIds) ? pendingIds : this._workingProduct[key] || [];
      const mergedIds = [...baseIds];
      if (!mergedIds.includes(created.id)) mergedIds.push(created.id);
      this._workingProduct[key] = mergedIds;
      this._workingProduct.variants = generateVariants(
        this._workingProduct.colorIds,
        this._workingProduct.sizeIds,
        this._workingProduct.variants,
        this._dictionaries,
      );
      this.applyUiFromWorking();
      wx.showToast({ title: '已添加', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' });
    }
  },

  async onSaveTap() {
    if (this.data.submitting) return;
    const perms = (this._tenantCtx && this._tenantCtx.permissions) || [];
    const canCreate = hasPermission(perms, 'basic:products:create');
    const canEdit = hasPermission(perms, 'basic:products:edit');
    if (this._productId && !canEdit) {
      wx.showToast({ title: '无编辑权限', icon: 'none' });
      return;
    }
    if (!this._productId && !canCreate) {
      wx.showToast({ title: '无创建权限', icon: 'none' });
      return;
    }

    const category = this.getActiveCategory();
    const prepared = prepareProductForSave(
      syncVariantsIfNeeded(this._workingProduct, category, this._dictionaries),
      this._products,
      category,
      this._originalProduct || undefined,
    );
    if (prepared.error) {
      wx.showToast({ title: prepared.error, icon: 'none' });
      return;
    }

    const codeAutoGen =
      this._codeAutoFill &&
      this._codeAutoFill.buildCodeAutoGenPayload(this._workingProduct, this.isNewRecord());
    const payload = codeAutoGen
      ? { ...prepared.payload, codeAutoGen }
      : prepared.payload;

    this.setData({ submitting: true });
    try {
      const exists = (this._products || []).some((p) => p.id === prepared.product.id);
      const saved = exists
        ? await updateProduct(prepared.product.id, payload)
        : await createProduct(payload);
      writeLastUnitForCategory(
        this._tenantCtx && this._tenantCtx.tenantId,
        saved.categoryId,
        saved.unitId,
      );
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.BASIC_PRODUCTS,
        toastTitle: '保存成功',
      });
      clearUnsavedFormDrafts();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._productId || this.data.submitting) return;
    wx.showModal({
      title: '删除产品',
      content: `确定删除产品「${this._workingProduct.name || this._workingProduct.sku}」？`,
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        try {
          await deleteProduct(this._productId);
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.BASIC_PRODUCTS,
            toastTitle: '已删除',
          });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          this.setData({ submitting: false });
        }
      },
    });
  },
});
