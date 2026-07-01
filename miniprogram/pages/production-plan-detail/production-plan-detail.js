const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { PlanDispatchStatus } = require('../../config/productionPlans.js');
const {
  mapPlanDetailView,
  planNumbersWithAncestors,
  canConvertPlan,
  normalizeMasterList,
  normalizeAppDictionaries,
} = require('../../utils/productionPlans.js');
const {
  getPlan,
  getProduct,
  convertPlan,
  fetchPlanRelated,
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchNodesAll,
  fetchEquipmentAll,
  fetchBomsAll,
  fetchStockMap,
  fetchDictionaries,
} = require('../../utils/planApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

/** 当前计划 + 子计划（getPlan 已含 childPlans，不再拉全量计划列表） */
function collectPlanTreePlans(plan) {
  const out = [];
  const seen = new Set();
  const walk = (p) => {
    if (!p || !p.id || seen.has(p.id)) return;
    seen.add(p.id);
    out.push(p);
    (p.childPlans || []).forEach(walk);
  };
  walk(plan);
  let parent = plan.parentPlan;
  while (parent && parent.id && !seen.has(parent.id)) {
    seen.add(parent.id);
    out.push(parent);
    parent = parent.parentPlan;
  }
  return out;
}

function buildPlanById(plan, allPlans) {
  const planById = new Map(allPlans.map((p) => [p.id, p]));
  planById.set(plan.id, plan);
  return planById;
}

function patchMaterialSection(sections, materialSection) {
  if (!materialSection) return sections;
  const idx = sections.findIndex((s) => s.id === 'material');
  if (idx < 0) return sections.concat([materialSection]);
  const next = sections.slice();
  next[idx] = materialSection;
  return next;
}

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = hasFooter ? Math.ceil(128 * rpx) + (win.safeAreaBottom || 0) : 0;
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

Page({
  data: {
    loading: true,
    title: '计划详情',
    planNumber: '',
    productHero: null,
    sections: [],
    canConvert: false,
    showConvertBtn: false,
    converting: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._nav = nav;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });

    this._planId = options.id ? decodeURIComponent(options.id) : '';
    if (!this._planId) {
      wx.showToast({ title: '缺少计划 ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.loadDetail();
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onUnload() {
    this._materialLoadToken = null;
    this._detailCtx = null;
  },

  updateScrollHeight(hasFooter) {
    const nav = this._nav || readNavBarMetrics();
    this.setData({
      scrollHeight: computeScrollHeight(nav, hasFooter),
    });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async loadDetail() {
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }

    this._materialLoadToken = null;
    this._detailCtx = null;
    this.setData({ loading: true });
    const canEdit = hasPermission(ctx.permissions || [], 'production:plans:edit');

    try {
      const [plan, config] = await Promise.all([
        getPlan(this._planId),
        fetchTenantConfig(),
      ]);

      if (!plan || !plan.id) {
        throw new Error('计划不存在');
      }

      const planFormSettings = (config && config.planFormSettings) || {};
      const listDisplay = planFormSettings.listDisplay || {};
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const showDeliveryDate = listDisplay.showDeliveryDate === true;
      const planWorkOrdersDispatched = (plan.derivedStatus || PlanDispatchStatus.NOT_DISPATCHED)
        !== PlanDispatchStatus.NOT_DISPATCHED;

      const [
        product,
        categories,
        nodes,
        equipment,
        dictionariesRaw,
      ] = await Promise.all([
        plan.productId ? getProduct(plan.productId).catch(() => null) : Promise.resolve(null),
        fetchCategoriesAll().then(normalizeMasterList),
        fetchNodesAll().then(normalizeMasterList),
        fetchEquipmentAll().then(normalizeMasterList),
        fetchDictionaries(),
      ]);

      const category = product ? categories.find((c) => c.id === product.categoryId) : null;
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);
      const allPlans = collectPlanTreePlans(plan);
      const planById = buildPlanById(plan, allPlans);
      const planNumbersForPO = planNumbersWithAncestors(plan, planById);
      const workers = [];

      const view = mapPlanDetailView(plan, {
        product,
        category,
        dictionaries,
        nodes,
        equipment,
        workers,
        boms: [],
        products: product ? [product] : [],
        categories,
        allPlans,
        stockMap: {},
        stockReady: false,
        planRelated: { purchaseOrders: [], purchaseBills: [] },
        planNumbersForPO,
        productionLinkMode,
        showDeliveryDate,
        planFormSettings,
        planWorkOrdersDispatched,
        materialLoading: true,
      });

      const showConvertBtn = canEdit && canConvertPlan(plan);

      this._detailCtx = {
        plan,
        product,
        category,
        dictionaries,
        nodes,
        equipment,
        categories,
        allPlans,
        planById,
        planNumbersForPO,
        workers,
        productionLinkMode,
        showDeliveryDate,
        planFormSettings,
        planWorkOrdersDispatched,
      };

      this.setData({
        loading: false,
        title: plan.planNumber || '计划详情',
        planNumber: plan.planNumber || '',
        productHero: view.productHero,
        sections: view.sections,
        canConvert: showConvertBtn,
        showConvertBtn,
      });
      this.updateScrollHeight(showConvertBtn);
      wx.setNavigationBarTitle({ title: plan.planNumber || '计划详情' });

      this.loadMaterials();
    } catch (err) {
      this.setData({ loading: false, sections: [], productHero: null });
      this.updateScrollHeight(false);
      wx.showToast({
        title: (err && err.message) || '加载失败',
        icon: 'none',
      });
      setTimeout(() => wx.navigateBack(), 1000);
    }
  },

  async loadMaterials() {
    const ctx = this._detailCtx;
    if (!ctx) return;

    const loadToken = Symbol('material');
    this._materialLoadToken = loadToken;

    try {
      const {
        plan,
        product: cachedProduct,
        category,
        dictionaries,
        nodes,
        equipment,
        categories,
        allPlans,
        planNumbersForPO,
        workers,
        productionLinkMode,
        showDeliveryDate,
        planFormSettings,
        planWorkOrdersDispatched,
      } = ctx;

      const [products, boms, stockMap, planRelated] = await Promise.all([
        fetchProductsAll().then(normalizeMasterList),
        fetchBomsAll().then((body) => (Array.isArray(body) ? body : normalizeMasterList(body))),
        fetchStockMap(),
        fetchPlanRelated(plan.id, planNumbersForPO),
      ]);

      if (this._materialLoadToken !== loadToken) return;

      const product = products.find((p) => p.id === plan.productId) || cachedProduct;
      const view = mapPlanDetailView(plan, {
        product,
        category: product
          ? (categories.find((c) => c.id === product.categoryId) || category)
          : category,
        dictionaries,
        nodes,
        equipment,
        workers,
        boms,
        products,
        categories,
        allPlans,
        stockMap,
        stockReady: true,
        planRelated,
        planNumbersForPO,
        productionLinkMode,
        showDeliveryDate,
        planFormSettings,
        planWorkOrdersDispatched,
      });

      const materialSection = view.sections.find((s) => s.id === 'material');
      this.setData({
        sections: patchMaterialSection(this.data.sections, materialSection),
      });
    } catch (err) {
      if (this._materialLoadToken !== loadToken) return;
      const loadError = (err && err.message) || '用料加载失败，请稍后重试';
      const sections = this.data.sections.map((s) => (
        s.id === 'material'
          ? {
            ...s,
            loading: false,
            loadError,
            materials: [],
            emptyText: '',
          }
          : s
      ));
      this.setData({ sections });
      wx.showToast({ title: loadError, icon: 'none' });
    }
  },

  onConvertTap() {
    if (this.data.converting || !this.data.showConvertBtn) return;
    wx.showModal({
      title: '下达工单',
      content: `确定将计划 ${this.data.planNumber} 下达为生产工单？`,
      confirmText: '下达',
      success: (res) => {
        if (res.confirm) this.doConvert();
      },
    });
  },

  async doConvert() {
    this.setData({ converting: true });
    try {
      const result = await convertPlan(this._planId);
      wx.showToast({ title: '已下达工单', icon: 'success' });
      const firstOrderId = result && result.orderIds && result.orderIds[0];
      if (firstOrderId) {
        wx.redirectTo({
          url: `/pages/production-order-detail/production-order-detail?id=${encodeURIComponent(firstOrderId)}`,
        });
        return;
      }
      await this.loadDetail();
    } catch (err) {
      wx.showToast({
        title: (err && err.message) || '下达失败',
        icon: 'none',
      });
    } finally {
      this.setData({ converting: false });
    }
  },
});
