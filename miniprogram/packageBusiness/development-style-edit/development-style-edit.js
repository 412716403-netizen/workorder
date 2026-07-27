const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');
const {
  fetchCategoriesAll,
  fetchDictionaries,
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
} = require('../../utils/planApi.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { request } = require('../../utils/request.js');
const { applyPartnerCreatedOnPage } = require('../../utils/mergePartnerList.js');
const { chooseProductImageAsDataUrl } = require('../utils/fileBase64.js');
const { createDictionaryItem } = require('../utils/dictionaryApi.js');
const {
  buildCategoryCustomFieldsForForm,
  applyCategoryCustomFieldValue,
} = require('../utils/productForm.js');
const {
  getDevStyle,
  createDevStyle,
  updateDevStyle,
  deleteDevStyle,
  listDevStageTemplates,
} = require('../utils/developmentApi.js');
const {
  buildEmptyDevStyle,
  syncDevStyleVariants,
  validateDevStyleForSave,
  buildDevStyleSavePayload,
} = require('../utils/devStyleForm.js');
const { resolveDevStyleCustomerName, canDeleteDevStyle } = require('../utils/devStyleDisplay.js');
const {
  fetchProductCodeRules,
} = require('../utils/productApi.js');
const {
  createProductCodeAutoFill,
} = require('../utils/productCodeAutoFill.js');
const { normalizeProductCodeRuleMap } = require('../utils/productCodeRule.js');

/** 开发款式 → 产品取号形状（name=产品编号，sku=款号/产品名称） */
function styleAsProductForCode(style) {
  return {
    name: (style && style.name) || '',
    sku: (style && style.code) || '',
    categoryId: (style && style.categoryId) || '',
    // 编号规则可含「合作单位」元素，需带上产品档案同名字段
    supplierId: (style && style.supplierId) || '',
    categoryCustomData: (style && style.categoryCustomData) || {},
  };
}

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
    pageTitle: '录入新产品',
    isEdit: false,
    canDelete: false,
    form: {},
    categoryOptions: [],
    unitName: '',
    supplierName: '',
    customFields: [],
    showSalesPrice: false,
    showPurchasePrice: false,
    showSupplier: false,
    showColorSize: false,
    canQuickAddUnit: false,
    canQuickAddDict: false,
    stageOptions: [],
    nodeOptions: [],
    canManageTemplates: false,
    pickerSheetOpen: false,
    stageSelectedCount: 0,
    nodeSelectedCount: 0,
    selectedStageRows: [],
    selectedNodeRows: [],
    autoCodeActive: false,
    namePlaceholder: '请填写',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
    this._styleId = options.id ? decodeURIComponent(options.id) : '';
    this._initialized = false;
    this._codeAutoFill = createProductCodeAutoFill({
      onFill: (code, prevAutoCode) => {
        if (!this._working || this._styleId) return;
        const cur = String(this._working.name || '').trim();
        if (cur && cur !== prevAutoCode && cur !== code) return;
        this._working.name = code;
        this.setData({
          'form.name': code,
          autoCodeActive: true,
          namePlaceholder: '按编号规则自动生成',
        });
      },
    });
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
    this._tenantCtx = ctx;
    loadFeaturePlugins().then((plugins) => {
      if (!isPluginEnabled(plugins, 'development')) {
        wx.showToast({ title: '开发管理插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const perms = ctx.permissions || [];
      const need = this._styleId ? 'development:styles:edit' : 'development:styles:create';
      if (!hasPermission(perms, need) && !hasPermission(perms, 'development:styles:view')) {
        wx.showToast({ title: '无权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this._canDelete = hasPermission(perms, 'development:styles:delete');
      this.setData({
        canManageTemplates: hasPermission(perms, 'development:templates:view'),
        canQuickAddUnit: hasPermission(perms, 'basic:dictionaries:create'),
        canQuickAddDict: hasPermission(perms, 'basic:dictionaries:create'),
      });
      if (!this._initialized) this.bootstrap();
      else if (this._needReloadTemplates) {
        this._needReloadTemplates = false;
        this.reloadTemplatesOnly();
      }
    });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onUnload() {
    if (this._codeAutoFill) this._codeAutoFill.dispose();
  },

  isNewRecord() {
    return !this._styleId;
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
    if (!this._codeAutoFill || !this._working) return;
    this._codeAutoFill.schedule(styleAsProductForCode(this._working), this.isNewRecord());
    this.syncAutoCodeUi();
  },

  syncAutoCodeUi() {
    if (!this._codeAutoFill || !this._working) return;
    const autoCodeActive = this._codeAutoFill.isAutoCodeActive(
      styleAsProductForCode(this._working),
      this.isNewRecord(),
    );
    this.setData({
      autoCodeActive,
      namePlaceholder: autoCodeActive ? '按编号规则自动生成' : '请填写',
    });
  },

  onRefreshAutoCode() {
    if (!this._codeAutoFill || !this._working || !this.isNewRecord()) return;
    this._codeAutoFill.refresh(styleAsProductForCode(this._working), true);
    this.syncAutoCodeUi();
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      if (this._codeAutoFill) this._codeAutoFill.reset();

      const [categories, dictionariesRaw, partners, partnerCategories, templates, nodesRaw, rulesRaw] =
        await Promise.all([
          fetchCategoriesAll(),
          fetchDictionaries(),
          fetchPartnersAll(),
          fetchPartnerCategoriesAll(),
          listDevStageTemplates().catch(() => []),
          request({ path: '/settings/nodes?all=true', method: 'GET', timeout: 60000 }).catch(() => []),
          fetchProductCodeRules().catch(() => ({})),
        ]);
      this._categories = categories || [];
      this._dictionaries = normalizeAppDictionaries(dictionariesRaw);
      this._partners = partners || [];
      this._partnerCategories = partnerCategories || [];
      this._templates = templates || [];
      this._globalNodes = Array.isArray(nodesRaw) ? nodesRaw : [];

      if (this._codeAutoFill) {
        this._codeAutoFill.setRules(normalizeProductCodeRuleMap(rulesRaw));
      }
      this.syncAutoCodeMasterData();

      let style;
      if (this._styleId) {
        style = await getDevStyle(this._styleId);
        if (!style) {
          wx.showToast({ title: '款式不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
      } else {
        const defaultCategoryId = (categories[0] && categories[0].id) || '';
        style = buildEmptyDevStyle(defaultCategoryId);
      }
      this._working = JSON.parse(JSON.stringify(style));
      this._originalImageUrl = String(style.imageUrl || '');
      this.applyUi();
      this.scheduleAutoCode();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async reloadTemplatesOnly() {
    try {
      this._templates = await listDevStageTemplates();
      this.applyUi();
    } catch {
      // ignore
    }
  },

  applyUi() {
    const style = this._working;
    const category = (this._categories || []).find((c) => c.id === style.categoryId);
    this._working = syncDevStyleVariants(style, category, this._dictionaries);
    const s = this._working;

    const categoryOptions = (this._categories || []).map((c) => ({
      id: c.id,
      name: c.name,
      selected: c.id === s.categoryId,
    }));
    const units = (this._dictionaries && this._dictionaries.units) || [];
    const unit = units.find((u) => u.id === s.unitId);

    const selectedStages = new Set(s.defaultStageNames || []);
    const stageOptions = [...(this._templates || [])]
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((t) => ({
        id: t.id,
        name: t.name,
        selected: selectedStages.has(t.name),
      }));
    // 已选但不在模板中的历史节点名
    (s.defaultStageNames || []).forEach((name) => {
      if (!stageOptions.some((o) => o.name === name)) {
        stageOptions.push({ id: `legacy-${name}`, name, selected: true });
      }
    });

    const selectedNodes = new Set(s.milestoneNodeIds || []);
    const nodeOptions = (this._globalNodes || []).map((n) => ({
      id: n.id,
      name: n.name || n.id,
      selected: selectedNodes.has(n.id),
    }));

    const selectedStageNames = s.defaultStageNames || [];
    const selectedStageRows = selectedStageNames.map((name, idx) => ({
      name,
      index: idx,
      orderLabel: String(idx + 1),
      canMoveUp: idx > 0,
      canMoveDown: idx < selectedStageNames.length - 1,
    }));

    const selectedNodeIds = s.milestoneNodeIds || [];
    const selectedNodeRows = selectedNodeIds
      .map((id, idx) => {
        const n = (this._globalNodes || []).find((g) => g.id === id);
        return {
          id,
          name: n ? n.name || id : id,
          orderLabel: String(idx + 1),
          canMoveUp: idx > 0,
          canMoveDown: idx < selectedNodeIds.length - 1,
        };
      })
      .filter(Boolean);

    const customFields = buildCategoryCustomFieldsForForm(category, {
      categoryCustomData: s.categoryCustomData || {},
    }).map((f) => {
      let pickerIndex = 0;
      if (f.type === 'select' && f.options.length) {
        const idx = f.options.indexOf(f.value);
        pickerIndex = idx >= 0 ? idx : 0;
      }
      return { ...f, pickerIndex };
    });

    this.setData({
      loading: false,
      isEdit: !!this._styleId,
      canDelete: !!(this._styleId && this._canDelete && canDeleteDevStyle(s)),
      pageTitle: this._styleId ? '编辑款式' : '录入新产品',
      form: {
        name: s.name || '',
        code: s.code || '',
        imageUrl: s.imageUrl || '',
        colorIds: s.colorIds || [],
        sizeIds: s.sizeIds || [],
        salesPriceText: s.salesPrice != null ? String(s.salesPrice) : '',
        purchasePriceText: s.purchasePrice != null ? String(s.purchasePrice) : '',
        unitId: s.unitId || '',
      },
      categoryOptions,
      unitName: unit ? unit.name : '',
      supplierName: findPartnerName(this._partners, s.supplierId),
      customFields,
      showSalesPrice: !!(category && category.hasSalesPrice),
      showPurchasePrice: !!(category && category.hasPurchasePrice),
      showSupplier: !!(category && category.linkPartner),
      showColorSize: !!(category && category.hasColorSize),
      stageOptions,
      nodeOptions,
      selectedStageRows,
      selectedNodeRows,
      stageSelectedCount: selectedStageNames.length,
      nodeSelectedCount: selectedNodeIds.length,
      partners: this._partners,
      partnerCategories: this._partnerCategories,
      dictionaries: this._dictionaries,
    });
    this.syncAutoCodeUi();
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    const cat = (this._categories || []).find((c) => c.id === id);
    if (!cat || cat.id === this._working.categoryId) return;
    this._working = {
      ...this._working,
      categoryId: cat.id,
      colorIds: cat.hasColorSize ? this._working.colorIds || [] : [],
      sizeIds: cat.hasColorSize ? this._working.sizeIds || [] : [],
      variants: cat.hasColorSize ? this._working.variants || [] : [],
    };
    this.applyUi();
    this.scheduleAutoCode();
  },

  onNameInput(e) {
    this._working.name = e.detail.value || '';
    this.setData({ 'form.name': this._working.name });
    if (!String(this._working.name).trim()) {
      this.scheduleAutoCode();
    } else {
      this.syncAutoCodeUi();
    }
  },

  onCodeInput(e) {
    this._working.code = e.detail.value || '';
    this.setData({ 'form.code': this._working.code });
    this.scheduleAutoCode();
  },

  onUnitChange(e) {
    const detail = e.detail || {};
    this._working.unitId = detail.id || undefined;
    this.setData({ unitName: detail.name || '', 'form.unitId': detail.id || '' });
  },

  onUnitsUpdated(e) {
    const unit = e.detail && e.detail.unit;
    if (!unit || !unit.id) return;
    const units = [...((this._dictionaries && this._dictionaries.units) || [])];
    if (!units.some((u) => u.id === unit.id)) units.push(unit);
    this._dictionaries = { ...this._dictionaries, units };
    this.setData({ dictionaries: this._dictionaries });
  },

  async onPickImage() {
    try {
      const dataUrl = await chooseProductImageAsDataUrl();
      if (!dataUrl) return;
      this._working.imageUrl = dataUrl;
      this.setData({ 'form.imageUrl': dataUrl });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '选图失败', icon: 'none' });
    }
  },

  onSalesPriceInput(e) {
    const t = e.detail.value || '';
    this._working.salesPrice = t === '' ? undefined : Number(t);
    this.setData({ 'form.salesPriceText': t });
  },

  onPurchasePriceInput(e) {
    const t = e.detail.value || '';
    this._working.purchasePrice = t === '' ? undefined : Number(t);
    this.setData({ 'form.purchasePriceText': t });
  },

  onSupplierChange(e) {
    const detail = e.detail || {};
    this._working.supplierId = detail.id || undefined;
    this._working.customerName = detail.name || undefined;
    this.setData({ supplierName: detail.name || '' });
    this.scheduleAutoCode();
  },

  onPartnerCreated(e) {
    applyPartnerCreatedOnPage(this, e.detail);
    this.syncAutoCodeMasterData();
  },

  onCustomFieldInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value || '';
    this._working = applyCategoryCustomFieldValue(this._working, id, value);
    this.applyUi();
    this.scheduleAutoCode();
  },

  onCustomSelectChange(e) {
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.detail.value) || 0;
    const field = (this.data.customFields || []).find((f) => f.id === id);
    if (!field) return;
    const value = (field.options || [])[idx] || '';
    this._working = applyCategoryCustomFieldValue(this._working, id, value);
    this.applyUi();
    this.scheduleAutoCode();
  },

  onColorSizeChange(e) {
    const detail = e.detail || {};
    const kind = detail.kind;
    const ids = detail.ids || [];
    if (kind === 'color') this._working.colorIds = ids;
    else if (kind === 'size') this._working.sizeIds = ids;
    this.applyUi();
  },

  async onColorSizeQuickAdd(e) {
    const detail = e.detail || {};
    const kind = detail.kind;
    const name = detail.name;
    const pendingIds = detail.pendingIds;
    if (!name || !kind) return;
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
      const baseIds = Array.isArray(pendingIds) ? pendingIds : this._working[key] || [];
      const mergedIds = [...baseIds];
      if (created && created.id && !mergedIds.includes(created.id)) mergedIds.push(created.id);
      this._working[key] = mergedIds;
      this.applyUi();
      wx.showToast({ title: '已添加', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' });
    }
  },

  onStageToggle(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    const selected = new Set(this._working.defaultStageNames || []);
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    // 新勾选追加到末尾；取消则移除；已选顺序保留
    const prev = this._working.defaultStageNames || [];
    const ordered = prev.filter((n) => selected.has(n));
    selected.forEach((n) => {
      if (ordered.indexOf(n) < 0) ordered.push(n);
    });
    this._working.defaultStageNames = ordered;
    this.applyUi();
  },

  onStageMoveUp(e) {
    const name = e.currentTarget.dataset.name;
    const list = [...(this._working.defaultStageNames || [])];
    const idx = list.indexOf(name);
    if (idx <= 0) return;
    [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
    this._working.defaultStageNames = list;
    this.applyUi();
  },

  onStageMoveDown(e) {
    const name = e.currentTarget.dataset.name;
    const list = [...(this._working.defaultStageNames || [])];
    const idx = list.indexOf(name);
    if (idx < 0 || idx >= list.length - 1) return;
    [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
    this._working.defaultStageNames = list;
    this.applyUi();
  },

  onNodeToggle(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const selected = (this._working.milestoneNodeIds || []).includes(id);
    if (selected) {
      this._working.milestoneNodeIds = (this._working.milestoneNodeIds || []).filter((x) => x !== id);
    } else {
      this._working.milestoneNodeIds = [...(this._working.milestoneNodeIds || []), id];
    }
    this.applyUi();
  },

  onNodeMoveUp(e) {
    const id = e.currentTarget.dataset.id;
    const list = [...(this._working.milestoneNodeIds || [])];
    const idx = list.indexOf(id);
    if (idx <= 0) return;
    [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
    this._working.milestoneNodeIds = list;
    this.applyUi();
  },

  onNodeMoveDown(e) {
    const id = e.currentTarget.dataset.id;
    const list = [...(this._working.milestoneNodeIds || [])];
    const idx = list.indexOf(id);
    if (idx < 0 || idx >= list.length - 1) return;
    [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
    this._working.milestoneNodeIds = list;
    this.applyUi();
  },

  onPickerSheetOpen() {
    this.setData({ pickerSheetOpen: true });
  },

  onPickerSheetClose() {
    this.setData({ pickerSheetOpen: false });
  },

  onOpenTemplates() {
    this._needReloadTemplates = true;
    wx.navigateTo({
      url: '/packageBusiness/development-stage-templates/development-stage-templates',
    });
  },

  async onSaveTap() {
    if (this.data.submitting) return;
    const category = (this._categories || []).find((c) => c.id === this._working.categoryId);
    this._working = syncDevStyleVariants(this._working, category, this._dictionaries);
    const err = validateDevStyleForSave(this._working, category);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const partnerName = resolveDevStyleCustomerName(this._working, this._partners);
    this.setData({ submitting: true });
    try {
      if (this._styleId) {
        // 只发可写字段；主图未变时省略（_working 详情含 samples 附件大字段，不能整包上传）
        const payload = buildDevStyleSavePayload(this._working, partnerName, {
          originalImageUrl: this._originalImageUrl || '',
        });
        await updateDevStyle(this._styleId, payload);
      } else {
        await createDevStyle(buildDevStyleSavePayload(this._working, partnerName));
      }
      try {
        const ec = this.getOpenerEventChannel && this.getOpenerEventChannel();
        if (ec && ec.emit) ec.emit('hubListChanged');
      } catch {
        // ignore
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      afterSaveReturnToList(LIST_ROUTES.DEVELOPMENT_STYLES);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  async onDeleteTap() {
    if (!this._styleId || !this.data.canDelete || this.data.submitting) return;
    const code = (this._working && this._working.code) || '';
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '删除款式',
        content: `确定删除「${code}」？仅当所有节点均为待开始时可删除。`,
        success: (res) => resolve(!!res.confirm),
      });
    });
    if (!ok) return;
    this.setData({ submitting: true });
    try {
      await deleteDevStyle(this._styleId);
      try {
        const ec = this.getOpenerEventChannel && this.getOpenerEventChannel();
        if (ec && ec.emit) ec.emit('hubListChanged');
      } catch {
        // ignore
      }
      wx.showToast({ title: '已删除', icon: 'success' });
      afterSaveReturnToList(LIST_ROUTES.DEVELOPMENT_STYLES);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
