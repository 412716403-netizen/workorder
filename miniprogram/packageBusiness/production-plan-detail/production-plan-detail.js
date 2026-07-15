const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/productionPlans.js'),PlanStatus = _require3.PlanStatus;
const _require4 =





  require('../../utils/productionPlans.js'),mapPlanDetailView = _require4.mapPlanDetailView,planNumbersWithAncestors = _require4.planNumbersWithAncestors,canConvertPlan = _require4.canConvertPlan,hasUnconvertedChildPlans = _require4.hasUnconvertedChildPlans,isPlanWorkOrdersDispatched = _require4.isPlanWorkOrdersDispatched,normalizeMasterList = _require4.normalizeMasterList,normalizeAppDictionaries = _require4.normalizeAppDictionaries;
const _require5 =












  require('../../utils/planApi.js'),getPlan = _require5.getPlan,getProduct = _require5.getProduct,convertPlan = _require5.convertPlan,fetchPlanRelated = _require5.fetchPlanRelated,fetchTenantConfig = _require5.fetchTenantConfig,fetchProductsAll = _require5.fetchProductsAll,fetchCategoriesAll = _require5.fetchCategoriesAll,fetchNodesAll = _require5.fetchNodesAll,fetchEquipmentAll = _require5.fetchEquipmentAll,fetchBomsAll = _require5.fetchBomsAll,fetchStockMap = _require5.fetchStockMap,fetchDictionaries = _require5.fetchDictionaries;
const _require6 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require6.readNavBarMetrics,readWindowMetrics = _require6.readWindowMetrics;

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
  const tailPx = Math.ceil(win.windowWidth / 750 * 16);
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
    showSupplementConvertBtn: false,
    showFooter: false,
    converting: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._nav = nav;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
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
      scrollHeight: computeScrollHeight(nav, hasFooter)
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
      const _await$Promise$all = await Promise.all([
        getPlan(this._planId),
        fetchTenantConfig()]
        ),plan = _await$Promise$all[0],config = _await$Promise$all[1];

      if (!plan || !plan.id) {
        throw new Error('计划不存在');
      }

      const planFormSettings = config && config.planFormSettings || {};
      const listDisplay = planFormSettings.listDisplay || {};
      const productionLinkMode = config && config.productionLinkMode || 'order';
      const showDeliveryDate = listDisplay.showDeliveryDate === true;

      const _await$Promise$all2 = await Promise.all([
        plan.productId ? getProduct(plan.productId).catch(() => null) : Promise.resolve(null),
        fetchCategoriesAll().then(normalizeMasterList),
        fetchNodesAll().then(normalizeMasterList),
        fetchEquipmentAll().then(normalizeMasterList),
        fetchDictionaries()]
      ),product = _await$Promise$all2[0],categories = _await$Promise$all2[1],nodes = _await$Promise$all2[2],equipment = _await$Promise$all2[3],dictionariesRaw = _await$Promise$all2[4];

      const category = product ? categories.find((c) => c.id === product.categoryId) : null;
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);
      const allPlans = collectPlanTreePlans(plan);
      const planById = buildPlanById(plan, allPlans);
      const planNumbersForPO = planNumbersWithAncestors(plan, planById);
      const workers = [];
      const planWorkOrdersDispatched = isPlanWorkOrdersDispatched(plan);
      const hasUnconvertedChildren = hasUnconvertedChildPlans(plan.id, allPlans);
      const showConvertBtn = canEdit && canConvertPlan(plan);
      const showSupplementConvertBtn =
        canEdit && !plan.parentPlanId && plan.status === PlanStatus.CONVERTED && hasUnconvertedChildren;
      const showFooter = showConvertBtn || showSupplementConvertBtn;

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
        materialLoading: true
      });

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
        planWorkOrdersDispatched
      };

      this.setData({
        loading: false,
        title: plan.planNumber || '计划详情',
        planNumber: plan.planNumber || '',
        productHero: view.productHero,
        sections: view.sections,
        canConvert: showConvertBtn,
        showConvertBtn,
        showSupplementConvertBtn,
        showFooter
      });
      this.updateScrollHeight(showFooter);
      wx.setNavigationBarTitle({ title: plan.planNumber || '计划详情' });

      this.loadMaterials();
    } catch (err) {
      this.setData({ loading: false, sections: [], productHero: null });
      this.updateScrollHeight(false);
      wx.showToast({
        title: err && err.message || '加载失败',
        icon: 'none'
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
      const
        plan =













        ctx.plan,cachedProduct = ctx.product,category = ctx.category,dictionaries = ctx.dictionaries,nodes = ctx.nodes,equipment = ctx.equipment,categories = ctx.categories,allPlans = ctx.allPlans,planNumbersForPO = ctx.planNumbersForPO,workers = ctx.workers,productionLinkMode = ctx.productionLinkMode,showDeliveryDate = ctx.showDeliveryDate,planFormSettings = ctx.planFormSettings,planWorkOrdersDispatched = ctx.planWorkOrdersDispatched;

      const _await$Promise$all3 = await Promise.all([
        fetchProductsAll().then(normalizeMasterList),
        fetchBomsAll().then((body) => Array.isArray(body) ? body : normalizeMasterList(body)),
        fetchStockMap(),
        fetchPlanRelated(plan.id, planNumbersForPO)]
        ),products = _await$Promise$all3[0],boms = _await$Promise$all3[1],stockMap = _await$Promise$all3[2],planRelated = _await$Promise$all3[3];

      if (this._materialLoadToken !== loadToken) return;

      const product = products.find((p) => p.id === plan.productId) || cachedProduct;
      const view = mapPlanDetailView(plan, {
        product,
        category: product ?
        categories.find((c) => c.id === product.categoryId) || category :
        category,
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
        planWorkOrdersDispatched
      });

      const materialSection = view.sections.find((s) => s.id === 'material');
      this.setData({
        sections: patchMaterialSection(this.data.sections, materialSection)
      });
    } catch (err) {
      if (this._materialLoadToken !== loadToken) return;
      const loadError = err && err.message || '用料加载失败，请稍后重试';
      const sections = this.data.sections.map((s) =>
      s.id === 'material' ?
      {
        ...s,
        loading: false,
        loadError,
        materials: [],
        emptyText: ''
      } :
      s
      );
      this.setData({ sections });
      wx.showToast({ title: loadError, icon: 'none' });
    }
  },

  onConvertTap() {
    if (this.data.converting) return;
    if (!this.data.showConvertBtn && !this.data.showSupplementConvertBtn) return;
    const isSupplement = this.data.showSupplementConvertBtn;
    wx.showModal({
      title: isSupplement ? '补充下达子工单' : '下达工单',
      content: isSupplement ?
        `确定为计划 ${this.data.planNumber} 补充下达子工单？` :
        `确定将计划 ${this.data.planNumber} 下达为生产工单？`,
      confirmText: '下达',
      success: (res) => {
        if (res.confirm) this.doConvert();
      }
    });
  },

  async doConvert() {
    this.setData({ converting: true });
    try {
      await convertPlan(this._planId);
      wx.showToast({ title: '已下达工单', icon: 'success' });
      await this.loadDetail();
    } catch (err) {
      wx.showToast({
        title: err && err.message || '下达失败',
        icon: 'none'
      });
    } finally {
      this.setData({ converting: false });
    }
  }
});