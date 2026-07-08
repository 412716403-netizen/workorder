const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/productionPlans.js'),PlanStatus = _require3.PlanStatus;
const _require4 =






  require('../utils/productionPlans.js'),productHasColorSizeMatrix = _require4.productHasColorSizeMatrix,variantLabel = _require4.variantLabel,localTodayYmd = _require4.localTodayYmd,normalizeMasterList = _require4.normalizeMasterList,normalizeAppDictionaries = _require4.normalizeAppDictionaries,formatProductLabelWithSku = _require4.formatProductLabelWithSku;
const _require5 =





  require('../utils/planFormCustomField.js'),customerShowInCreate = _require5.customerShowInCreate,buildPlanCreateCustomFields = _require5.buildPlanCreateCustomFields,buildInitialPlanCustomData = _require5.buildInitialPlanCustomData,getProductUnitName = _require5.getProductUnitName,buildCustomDataPayload = _require5.buildCustomDataPayload;
const _require6 = require('../utils/variantQtyMatrix.js'),buildVariantMatrixUiModel = _require6.buildVariantMatrixUiModel;
const _require7 =






  require('../utils/matrixQtyKeyboard.js'),activateMatrixKeyboardCell = _require7.activateMatrixKeyboardCell,applyMatrixKeyboardKey = _require7.applyMatrixKeyboardKey,buildMatrixKeyboardPreview = _require7.buildMatrixKeyboardPreview,createMatrixKeyboardInputSession = _require7.createMatrixKeyboardInputSession,getNextMatrixVariantIdInColumn = _require7.getNextMatrixVariantIdInColumn,getNextMatrixVariantIdInRow = _require7.getNextMatrixVariantIdInRow;
const _require8 =







  require('../utils/planApi.js'),createPlan = _require8.createPlan,fetchTenantConfig = _require8.fetchTenantConfig,fetchProductsAll = _require8.fetchProductsAll,fetchCategoriesAll = _require8.fetchCategoriesAll,fetchPartnersAll = _require8.fetchPartnersAll,fetchPartnerCategoriesAll = _require8.fetchPartnerCategoriesAll,fetchDictionaries = _require8.fetchDictionaries;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics,computePlanCreateHeaderHeight = _require9.computePlanCreateHeaderHeight;
const _require0 = require('../utils/saveNavigation.js'),LIST_ROUTES = _require0.LIST_ROUTES,afterSaveReturnToList = _require0.afterSaveReturnToList;
const _require1 = require('../utils/matrixKeyboardLayout.js'),afterMatrixKeyboardOpen = _require1.afterMatrixKeyboardOpen;

function computeHeaderBlockHeight(nav) {
  return computePlanCreateHeaderHeight(nav);
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

Page({
  data: {
    loading: true,
    submitting: false,
    products: [],
    categories: [],
    partners: [],
    partnerCategories: [],
    createCustomFields: [],
    customData: {},
    productId: '',
    productName: '',
    customer: '',
    dueDate: '',
    showCustomer: false,
    showDeliveryDate: true,
    unitName: 'PCS',
    useVariantMatrix: false,
    matrixLayout: null,
    variantRows: [],
    singleQuantity: '',
    totalQuantity: 0,
    canSubmit: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    matrixScrollTop: 0
  },

  onLoad() {
    const nav = readNavBarMetrics();
    this._matrixKbInput = createMatrixKeyboardInputSession();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav)
    });
    this.bootstrap();
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
    if (!hasPermission(ctx.permissions || [], 'production:plans:create')) {
      wx.showToast({ title: '无新建权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    try {
      const _await$Promise$all =
        await Promise.all([
        fetchTenantConfig(),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll(),
        fetchDictionaries()]
        ),config = _await$Promise$all[0],productsRaw = _await$Promise$all[1],categoriesRaw = _await$Promise$all[2],partnersRaw = _await$Promise$all[3],partnerCategoriesRaw = _await$Promise$all[4],dictionariesRaw = _await$Promise$all[5];

      const planFormSettings = config && config.planFormSettings || {};
      const listDisplay = planFormSettings.listDisplay || {};
      const productionLinkMode = config && config.productionLinkMode || 'order';
      const createCustomFields = buildPlanCreateCustomFields(planFormSettings);
      const customData = buildInitialPlanCustomData(createCustomFields);
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const partners = normalizeMasterList(partnersRaw);
      const partnerCategories = normalizeMasterList(partnerCategoriesRaw);
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);

      this._planFormSettings = planFormSettings;
      this._productionLinkMode = productionLinkMode;
      this._categories = categories;
      this._dictionaries = dictionaries;
      this._products = products;
      this._variantQty = {};

      this.setData({
        loading: false,
        products,
        categories,
        partners,
        partnerCategories,
        showCustomer: customerShowInCreate(planFormSettings, productionLinkMode),
        showDeliveryDate: listDisplay.showDeliveryDate !== false,
        createCustomFields,
        customData
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  applyProductSelection(product) {
    const category = product ? this._categories.find((c) => c.id === product.categoryId) : null;
    const useVariantMatrix = productHasColorSizeMatrix(product, category);
    this._selectedProduct = product;
    this._selectedCategory = category;
    this._variantQty = {};

    let matrixLayout = null;
    let variantRows = [];

    if (useVariantMatrix && product && product.variants && product.variants.length) {
      matrixLayout = buildVariantMatrixUiModel(product, this._dictionaries, this._variantQty);
      if (!matrixLayout) {
        variantRows = product.variants.map((v) => {
          const colors = this._dictionaries.colors || [];
          const sizes = this._dictionaries.sizes || [];
          const colorLabel =
          (colors.find((c) => c.id === v.colorId) || {}).name || '—';
          const sizeLabel =
          (sizes.find((s) => s.id === v.sizeId) || {}).name || '—';
          return {
            variantId: v.id,
            colorLabel,
            sizeLabel,
            label: variantLabel(v, this._dictionaries),
            quantity: ''
          };
        });
      }
    }

    this.setData({
      productId: product ? product.id : '',
      productName: product ? formatProductLabelWithSku(product) : '',
      unitName: getProductUnitName(product, this._dictionaries),
      useVariantMatrix,
      matrixLayout,
      variantRows,
      singleQuantity: '',
      totalQuantity: 0,
      matrixKeyboardVisible: false,
      matrixInputReplaceAll: false,
      activeMatrixVariantId: ''
    });
    this.refreshCanSubmit();
  },

  onProductChange(e) {
    const _ref = e.detail || {},product = _ref.product;
    this.applyProductSelection(product || null);
  },

  onCustomerChange(e) {
    this.setData({ customer: e.detail && e.detail.name || '' });
  },

  onDueDateChange(e) {
    this.setData({ dueDate: e.detail.value || '' });
  },

  onCustomDataChange(e) {
    const customData = e.detail && e.detail.customData || {};
    this.setData({ customData });
  },

  onSingleQtyInput(e) {
    this.setData({ singleQuantity: e.detail.value || '' });
    this.refreshCanSubmit();
  },

  rebuildMatrixLayout() {
    const matrixLayout = buildVariantMatrixUiModel(
      this._selectedProduct,
      this._dictionaries,
      this._variantQty
    );
    this.setData({ matrixLayout });
    this.syncMatrixKeyboardPreview();
    this.refreshCanSubmit();
  },

  syncMatrixKeyboardPreview(variantId) {
    const id = variantId !== undefined ? variantId : this.data.activeMatrixVariantId;
    const preview = buildMatrixKeyboardPreview(this.data.matrixLayout, id, this._variantQty);
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    });
  },

  onMatrixCellTap(e) {
    const variantId = e.currentTarget.dataset.variantId;
    if (!variantId) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(this.data.matrixLayout, variantId, this._variantQty);
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    }, () => {
      afterMatrixKeyboardOpen(this, '.plan-create-scroll');
    });
  },

  onMatrixKeyboardAction(e) {
    const _ref2 = e.detail || {},action = _ref2.action,digit = _ref2.digit;
    if (action === 'confirm') {
      this.setData({
        matrixKeyboardVisible: false,
        matrixInputReplaceAll: false,
        activeMatrixVariantId: '',
        matrixKeyboardLabel: '',
        matrixKeyboardValue: ''
      });
      return;
    }
    const _this$data = this.data,activeMatrixVariantId = _this$data.activeMatrixVariantId,matrixLayout = _this$data.matrixLayout;
    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(matrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, this._variantQty);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value
        }, () => {
          afterMatrixKeyboardOpen(this, '.plan-create-scroll');
        });
      } else {
        this.setData({
          matrixKeyboardVisible: false,
          matrixInputReplaceAll: false,
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: ''
        });
      }
      return;
    }
    if (action === 'next') {
      const nextId = getNextMatrixVariantIdInColumn(matrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, this._variantQty);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value
        }, () => {
          afterMatrixKeyboardOpen(this, '.plan-create-scroll');
        });
      } else {
        this.setData({
          matrixKeyboardVisible: false,
          matrixInputReplaceAll: false,
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: ''
        });
      }
      return;
    }
    if (!activeMatrixVariantId) return;
    const current = this._variantQty[activeMatrixVariantId] || '';
    const _applyMatrixKeyboardK = applyMatrixKeyboardKey(this._matrixKbInput, current, action, digit),value = _applyMatrixKeyboardK.value,replaceConsumed = _applyMatrixKeyboardK.replaceConsumed;
    this._variantQty[activeMatrixVariantId] = value;
    if (replaceConsumed) {
      this.setData({ matrixInputReplaceAll: false });
    }
    this.rebuildMatrixLayout();
  },

  onVariantQtyInput(e) {
    const index = e.currentTarget.dataset.index;
    const val = e.detail.value || '';
    const rows = (this.data.variantRows || []).slice();
    if (rows[index]) {
      rows[index] = {
        variantId: rows[index].variantId,
        colorLabel: rows[index].colorLabel,
        sizeLabel: rows[index].sizeLabel,
        label: rows[index].label,
        quantity: val
      };
    }
    this.setData({ variantRows: rows });
    this.refreshCanSubmit();
  },

  computeTotalQuantity() {
    const _this$data2 = this.data,useVariantMatrix = _this$data2.useVariantMatrix,matrixLayout = _this$data2.matrixLayout,variantRows = _this$data2.variantRows,singleQuantity = _this$data2.singleQuantity;
    if (!useVariantMatrix) return parseInt(singleQuantity, 10) || 0;
    if (matrixLayout) {
      let sum = 0;
      (matrixLayout.colorRows || []).forEach((row) => {
        (row.cells || []).forEach((cell) => {
          if (cell.variantId) sum += parseInt(cell.quantity, 10) || 0;
        });
      });
      return sum;
    }
    return variantRows.reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0);
  },

  refreshCanSubmit() {
    const _this$data3 = this.data,productId = _this$data3.productId,useVariantMatrix = _this$data3.useVariantMatrix,singleQuantity = _this$data3.singleQuantity,variantRows = _this$data3.variantRows,matrixLayout = _this$data3.matrixLayout;
    const totalQuantity = this.computeTotalQuantity();
    if (!productId) {
      this.setData({ canSubmit: false, totalQuantity: 0 });
      return;
    }
    let ok = false;
    if (useVariantMatrix) {
      if (matrixLayout) {
        ok = totalQuantity > 0;
      } else {
        ok = variantRows.some((r) => parseInt(r.quantity, 10) > 0);
      }
    } else {
      ok = parseInt(singleQuantity, 10) > 0;
    }
    this.setData({ canSubmit: ok, totalQuantity });
  },

  buildItems() {
    const _this$data4 = this.data,useVariantMatrix = _this$data4.useVariantMatrix,singleQuantity = _this$data4.singleQuantity,variantRows = _this$data4.variantRows,matrixLayout = _this$data4.matrixLayout;
    if (useVariantMatrix) {
      if (matrixLayout) {
        const items = [];
        (matrixLayout.colorRows || []).forEach((row) => {
          (row.cells || []).forEach((cell) => {
            const qty = parseInt(cell.quantity, 10) || 0;
            if (cell.variantId && qty > 0) {
              items.push({ variantId: cell.variantId, quantity: qty });
            }
          });
        });
        return items;
      }
      return variantRows.
      map((r) => ({ variantId: r.variantId, quantity: parseInt(r.quantity, 10) || 0 })).
      filter((it) => it.quantity > 0);
    }
    const qty = parseInt(singleQuantity, 10) || 0;
    return qty > 0 ? [{ quantity: qty }] : [];
  },

  async onSubmit() {
    if (this.data.submitting || !this.data.canSubmit) return;
    const product = this._selectedProduct;
    if (!product) {
      wx.showToast({ title: '请选择产品', icon: 'none' });
      return;
    }
    if (!(product.milestoneNodeIds && product.milestoneNodeIds.length)) {
      wx.showToast({ title: '该产品未配置工序，不允许创建生产计划', icon: 'none' });
      return;
    }
    const items = this.buildItems();
    if (!items.length) {
      wx.showToast({ title: '请填写生产数量', icon: 'none' });
      return;
    }

    const today = localTodayYmd();
    const customData = buildCustomDataPayload(
      this.data.createCustomFields,
      this.data.customData
    );
    const body = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId: this.data.productId,
      items,
      startDate: today,
      status: PlanStatus.APPROVED,
      customer: this.data.showCustomer ? this.data.customer || '' : '',
      priority: 'Medium',
      assignments: {},
      createdAt: today
    };
    if (customData) body.customData = customData;
    if (this.data.showDeliveryDate && this.data.dueDate) {
      body.dueDate = this.data.dueDate;
    }

    this.setData({ submitting: true });
    try {
      await createPlan(body);
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.PRODUCTION_PLANS,
        toastTitle: '创建成功'
      });
    } catch (err) {
      wx.showToast({
        title: err && err.message || '创建失败',
        icon: 'none'
      });
      this.setData({ submitting: false });
    }
  }
});