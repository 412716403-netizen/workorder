const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { PlanStatus } = require('../../config/productionPlans.js');
const {
  productHasColorSizeMatrix,
  variantLabel,
  localTodayYmd,
  normalizeMasterList,
  normalizeAppDictionaries,
  formatProductLabelWithSku,
} = require('../../utils/productionPlans.js');
const {
  customerShowInCreate,
  buildPlanCreateCustomFields,
  buildInitialPlanCustomData,
  getProductUnitName,
  buildCustomDataPayload,
} = require('../../utils/planFormCustomField.js');
const { buildVariantMatrixUiModel } = require('../../utils/variantQtyMatrix.js');
const {
  applyMatrixKeyPress,
  buildMatrixKeyboardPreview,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');
const {
  createPlan,
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
  fetchDictionaries,
} = require('../../utils/planApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
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
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
  },

  onLoad() {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
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
      const [config, productsRaw, categoriesRaw, partnersRaw, partnerCategoriesRaw, dictionariesRaw] =
        await Promise.all([
          fetchTenantConfig(),
          fetchProductsAll(),
          fetchCategoriesAll(),
          fetchPartnersAll(),
          fetchPartnerCategoriesAll(),
          fetchDictionaries(),
        ]);

      const planFormSettings = (config && config.planFormSettings) || {};
      const listDisplay = planFormSettings.listDisplay || {};
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
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
        customData,
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
            quantity: '',
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
      activeMatrixVariantId: '',
    });
    this.refreshCanSubmit();
  },

  onProductChange(e) {
    const { product } = e.detail || {};
    this.applyProductSelection(product || null);
  },

  onCustomerChange(e) {
    this.setData({ customer: (e.detail && e.detail.name) || '' });
  },

  onDueDateChange(e) {
    this.setData({ dueDate: e.detail.value || '' });
  },

  onCustomDataChange(e) {
    const customData = (e.detail && e.detail.customData) || {};
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
      this._variantQty,
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
      matrixKeyboardValue: preview.value,
    });
  },

  onMatrixCellTap(e) {
    const { variantId } = e.currentTarget.dataset;
    if (!variantId) return;
    const preview = buildMatrixKeyboardPreview(this.data.matrixLayout, variantId, this._variantQty);
    this.setData({
      matrixKeyboardVisible: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    });
  },

  onMatrixKeyboardAction(e) {
    const { action, digit } = e.detail || {};
    if (action === 'confirm') {
      this.setData({
        matrixKeyboardVisible: false,
        activeMatrixVariantId: '',
        matrixKeyboardLabel: '',
        matrixKeyboardValue: '',
      });
      return;
    }
    const { activeMatrixVariantId, matrixLayout } = this.data;
    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(matrixLayout, activeMatrixVariantId);
      if (nextId) {
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, this._variantQty);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        });
      } else {
        this.setData({
          matrixKeyboardVisible: false,
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: '',
        });
      }
      return;
    }
    if (action === 'next') {
      const nextId = getNextMatrixVariantIdInColumn(matrixLayout, activeMatrixVariantId);
      if (nextId) {
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, this._variantQty);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        });
      } else {
        this.setData({
          matrixKeyboardVisible: false,
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: '',
        });
      }
      return;
    }
    if (!activeMatrixVariantId) return;
    const current = this._variantQty[activeMatrixVariantId] || '';
    this._variantQty[activeMatrixVariantId] = applyMatrixKeyPress(current, action, digit);
    this.rebuildMatrixLayout();
  },

  onVariantQtyInput(e) {
    const { index } = e.currentTarget.dataset;
    const val = e.detail.value || '';
    const rows = (this.data.variantRows || []).slice();
    if (rows[index]) {
      rows[index] = {
        variantId: rows[index].variantId,
        colorLabel: rows[index].colorLabel,
        sizeLabel: rows[index].sizeLabel,
        label: rows[index].label,
        quantity: val,
      };
    }
    this.setData({ variantRows: rows });
    this.refreshCanSubmit();
  },

  computeTotalQuantity() {
    const { useVariantMatrix, matrixLayout, variantRows, singleQuantity } = this.data;
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
    const { productId, useVariantMatrix, singleQuantity, variantRows, matrixLayout } = this.data;
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
    const { useVariantMatrix, singleQuantity, variantRows, matrixLayout } = this.data;
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
      return variantRows
        .map((r) => ({ variantId: r.variantId, quantity: parseInt(r.quantity, 10) || 0 }))
        .filter((it) => it.quantity > 0);
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
      this.data.customData,
    );
    const body = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId: this.data.productId,
      items,
      startDate: today,
      status: PlanStatus.APPROVED,
      customer: this.data.showCustomer ? (this.data.customer || '') : '',
      priority: 'Medium',
      assignments: {},
      createdAt: today,
    };
    if (customData) body.customData = customData;
    if (this.data.showDeliveryDate && this.data.dueDate) {
      body.dueDate = this.data.dueDate;
    }

    this.setData({ submitting: true });
    try {
      const created = await createPlan(body);
      wx.showToast({ title: '创建成功', icon: 'success' });
      const id = created && created.id;
      if (id) {
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/production-plan-detail/production-plan-detail?id=${encodeURIComponent(id)}`,
          });
        }, 400);
      } else {
        setTimeout(() => wx.navigateBack(), 400);
      }
    } catch (err) {
      wx.showToast({
        title: (err && err.message) || '创建失败',
        icon: 'none',
      });
      this.setData({ submitting: false });
    }
  },
});
