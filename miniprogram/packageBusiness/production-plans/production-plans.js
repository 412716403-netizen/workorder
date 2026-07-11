const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../../utils/listResponse.js'),normalizeListBody = _require3.normalizeListBody;
const _require4 =


  require('../config/productionPlans.js'),DEFAULT_PAGE_SIZE = _require4.DEFAULT_PAGE_SIZE,STATUS_FILTER_TABS = _require4.STATUS_FILTER_TABS;
const _require5 =





  require('../utils/productionPlans.js'),parsePlanSearch = _require5.parsePlanSearch,mapPlanListRow = _require5.mapPlanListRow,buildPurchaseProgressRequest = _require5.buildPurchaseProgressRequest,normalizeMasterList = _require5.normalizeMasterList,productNameSkuParts = _require5.productNameSkuParts,buildPlanListActionFlags = _require5.buildPlanListActionFlags;
const _require6 =





  require('../utils/planApi.js'),listPlansPaginated = _require6.listPlansPaginated,fetchPlansPurchaseProgress = _require6.fetchPlansPurchaseProgress,fetchTenantConfig = _require6.fetchTenantConfig,fetchProductsAll = _require6.fetchProductsAll,fetchCategoriesAll = _require6.fetchCategoriesAll,convertPlan = _require6.convertPlan;
const _require7 = require('../utils/planOrderSort.js'),sortPlansNewestFirst = _require7.sortPlansNewestFirst;
const _require8 = require('../utils/reportCustomDocField.js'),mapProductCustomTags = _require8.mapProductCustomTags;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;
const _require10 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require10.fetchAllOrdersPaginated;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function isFilterActive(statusFilter, excludeCompleted) {
  return statusFilter !== 'all' || !!excludeCompleted;
}

/** 列表 setData 用精简行，避免多余字段进入视图层 */
function slimPlanListRow(row) {
  const tags = (row.productCustomTags || []).slice(0, 3).map((t) => ({
    id: t.id,
    label: t.label,
    display: String(t.display || '').slice(0, 48)
  }));
  return {
    id: row.id,
    planNumber: row.planNumber,
    productName: row.productName,
    productSku: row.productSku,
    showProductSku: row.showProductSku,
    productImageUrl: row.productImageUrl,
    showProductImage: row.showProductImage,
    productCustomTags: tags,
    showProductCustomTags: tags.length > 0,
    placeholderIconSrc: row.placeholderIconSrc,
    customer: row.customer,
    showCustomer: row.showCustomer,
    dueDateLabel: row.dueDateLabel,
    showDueDate: row.showDueDate,
    showSubRow: Boolean(row.showCustomer || row.showDueDate),
    createdAtText: row.createdAtText,
    showCreatedAt: row.showCreatedAt,
    quantityText: row.quantityText,
    showQuantity: row.showQuantity,
    dispatchLabel: row.dispatchLabel,
    dispatchPillClass: row.dispatchPillClass,
    progressPct: row.progressPct,
    progressLabel: row.progressLabel,
    progressComplete: row.progressComplete,
    progressOverReceived: row.progressOverReceived,
    progressOrderedBarPct: row.progressOrderedBarPct,
    progressOverBarPct: row.progressOverBarPct,
    showProgress: row.showProgress,
    showDetailBtn: row.showDetailBtn,
    showConvertBtn: row.showConvertBtn,
    showSupplementConvertBtn: row.showSupplementConvertBtn,
    showOrderDetailBtn: row.showOrderDetailBtn,
    showActions: row.showActions,
    linkedOrderId: row.linkedOrderId
  };
}

function buildListQuery({
  page,
  pageSize,
  searchKeyword,
  statusFilter,
  excludeCompleted,
  productionLinkMode
}) {
  const parsed = parsePlanSearch(searchKeyword);
  const params = {
    page,
    pageSize
  };
  if (parsed.search) params.search = parsed.search;
  if (productionLinkMode === 'order') {
    const dispatchStatus = parsed.dispatchStatus || (
    statusFilter && statusFilter !== 'all' ? statusFilter : undefined);
    if (dispatchStatus) params.dispatchStatus = dispatchStatus;
    if (excludeCompleted) params.excludeCompleted = 'true';
  } else if (parsed.search) {
    params.search = parsed.search;
  }
  return params;
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    rows: [],
    searchKeyword: '',
    statusFilter: 'all',
    statusTabs: STATUS_FILTER_TABS,
    showStatusTabs: true,
    excludeCompleted: false,
    showExcludeToggle: false,
    showPurchaseProgress: false,
    showDeliveryDate: true,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    hasMore: false,
    canCreate: false,
    canEdit: false,
    canViewOrderDetail: false,
    convertingPlanId: '',
    emptyText: '暂无生产计划',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 120,
    showFilterPanel: false,
    filterActive: false
  },

  _pendingStatusFilter: 'all',
  _pendingExcludeCompleted: false,

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
    });

    const planId = options.planId ? decodeURIComponent(options.planId) : '';
    if (planId) {
      this._loadingDetail = true;
      wx.redirectTo({
        url: `/packageBusiness/production-plan-detail/production-plan-detail?id=${encodeURIComponent(planId)}`
      });
      return;
    }
    this._initialized = false;
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
    this.setData({
      canCreate: hasPermission(ctx.permissions || [], 'production:plans:create') &&
      hasPermission(ctx.permissions || [], 'basic:products:view'),
      canEdit: hasPermission(ctx.permissions || [], 'production:plans:edit'),
      canViewOrderDetail: hasPermission(ctx.permissions || [], 'production:orders_detail:view')
    });
    if (!this._initialized) {
      this.bootstrap();
    } else if (!this._loadingDetail) {
      this.reloadList();
    }
  },

  onPullDownRefresh() {
    this.reloadList().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.loadPage(this.data.page + 1, true);
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onCreateTap() {
    if (!this.data.canCreate) {
      wx.showToast({ title: '暂无新建权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/packageBusiness/production-plan-create/production-plan-create' });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    this._filterSnapshot = {
      statusFilter: this.data.statusFilter,
      excludeCompleted: this.data.excludeCompleted
    };
    this._pendingStatusFilter = this.data.statusFilter;
    this._pendingExcludeCompleted = this.data.excludeCompleted;
    this.setData({ showFilterPanel: true });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    const snap = this._filterSnapshot || {};
    this.setData({
      showFilterPanel: false,
      statusFilter: snap.statusFilter != null ? snap.statusFilter : 'all',
      excludeCompleted: !!snap.excludeCompleted
    });
  },

  onPageScroll() {
    this.closeFilterPanel();
  },

  onFilterReset() {
    this._pendingStatusFilter = 'all';
    this._pendingExcludeCompleted = false;
    this._filterSnapshot = { statusFilter: 'all', excludeCompleted: false };
    this.setData({
      statusFilter: 'all',
      excludeCompleted: false,
      showFilterPanel: false,
      filterActive: false
    });
    this.reloadList();
  },

  onFilterApply() {
    const statusFilter = this._pendingStatusFilter != null ?
    this._pendingStatusFilter :
    this.data.statusFilter;
    const excludeCompleted = !!this._pendingExcludeCompleted;
    this._filterSnapshot = { statusFilter, excludeCompleted };
    this.setData({
      statusFilter,
      excludeCompleted,
      showFilterPanel: false,
      filterActive: isFilterActive(statusFilter, excludeCompleted)
    });
    this.reloadList();
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.reloadList(), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.reloadList();
  },

  onStatusTabTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this._pendingStatusFilter = id;
    if (this.data.showFilterPanel) {
      this.setData({ statusFilter: id });
      return;
    }
    if (id === this.data.statusFilter) return;
    this.setData({
      statusFilter: id,
      filterActive: isFilterActive(id, this.data.excludeCompleted)
    });
    this.reloadList();
  },

  onExcludeToggle() {
    const excludeCompleted = this.data.showFilterPanel ?
    !this._pendingExcludeCompleted :
    !this.data.excludeCompleted;
    if (this.data.showFilterPanel) {
      this._pendingExcludeCompleted = excludeCompleted;
      this.setData({ excludeCompleted });
      return;
    }
    this.setData({
      excludeCompleted,
      filterActive: isFilterActive(this.data.statusFilter, excludeCompleted)
    });
    this.reloadList();
  },

  onRowTap(e) {
    this.closeFilterPanel();
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.openPlanDetail(id);
  },

  onDetailTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.openPlanDetail(id);
  },

  openPlanDetail(id) {
    wx.navigateTo({
      url: `/packageBusiness/production-plan-detail/production-plan-detail?id=${encodeURIComponent(id)}`
    });
  },

  onConvertTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.convertingPlanId) return;
    const plan = (this._allPlans || []).find((p) => p.id === id);
    const planNumber = plan && plan.planNumber ? plan.planNumber : '';
    wx.showModal({
      title: '下达工单',
      content: planNumber ?
        `确定将计划 ${planNumber} 下达为生产工单？` :
        '确定将该计划下达为生产工单？',
      confirmText: '下达',
      success: (res) => {
        if (res.confirm) this.doConvertPlan(id);
      }
    });
  },

  async doConvertPlan(planId) {
    this.setData({ convertingPlanId: planId });
    try {
      await convertPlan(planId);
      wx.showToast({ title: '已下达工单', icon: 'success' });
      this._orders = await fetchAllOrdersPaginated({}).catch(() => this._orders || []);
      await this.reloadList();
    } catch (err) {
      wx.showToast({
        title: err && err.message || '下达失败',
        icon: 'none'
      });
    } finally {
      this.setData({ convertingPlanId: '' });
    }
  },

  onOrderDetailTap(e) {
    const orderId = e.currentTarget.dataset.orderId;
    const planId = e.currentTarget.dataset.planId;
    let resolvedId = orderId;
    if (!resolvedId && planId) {
      const { resolvePrimaryOrderIdForPlan } = require('../utils/resolvePrimaryOrderIdForPlan.js');
      resolvedId = resolvePrimaryOrderIdForPlan(planId, this._orders || []);
    }
    if (!resolvedId) {
      wx.showToast({ title: '未找到关联工单，请刷新后重试', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/packageBusiness/production-order-detail/production-order-detail?id=${encodeURIComponent(resolvedId)}`
    });
  },

  productMetaForPlan(plan) {
    const product = this._productMap.get(plan.productId);
    if (!product) return { name: '', sku: '', showSku: false, imageUrl: '', customTags: [], categoryLabel: '' };
    const category = product.categoryId ? this._categoryMap.get(product.categoryId) : null;
    const customTags = mapProductCustomTags(product, category, { includeFile: false });
    const display = productNameSkuParts(product);
    return {
      name: display.name,
      sku: display.sku,
      showSku: display.showSku,
      imageUrl: product.imageUrl || '',
      customTags,
      categoryLabel: category && category.name ? category.name : ''
    };
  },

  mapRowsFromPlans(plans) {
    const allPlans = this._allPlans || plans || [];
    const orders = this._orders || [];
    const canEdit = this.data.canEdit;
    const canViewOrderDetail = this.data.canViewOrderDetail;
    return (plans || []).map((plan) => {
      const meta = this.productMetaForPlan(plan);
      const row = mapPlanListRow(plan, {
        productName: meta.name,
        productSku: meta.sku,
        showProductSku: meta.showSku,
        productImageUrl: meta.imageUrl,
        productCustomTags: meta.customTags,
        categoryLabel: meta.categoryLabel,
        purchaseProgress: this._progressMap.get(plan.id),
        showDeliveryDate: this.data.showDeliveryDate
      });
      const actions = buildPlanListActionFlags(plan, {
        allPlans,
        orders,
        canEdit,
        canViewOrderDetail
      });
      return slimPlanListRow({ ...row, ...actions });
    });
  },

  onProductImageError(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const rows = (this.data.rows || []).map((row) =>
    row.id === id ? { ...row, showProductImage: false } : row
    );
    this.setData({ rows });
  },

  async bootstrap() {
    this._initialized = true;
    this._productMap = new Map();
    this._categoryMap = new Map();
    try {
      const config = await fetchTenantConfig();
      const planFormSettings = config.planFormSettings || {};
      const listDisplay = planFormSettings.listDisplay || {};
      const productionLinkMode = config.productionLinkMode || 'order';
      this._productionLinkMode = productionLinkMode;
      this._showPurchaseProgress = !!listDisplay.showPurchaseProgress;
      this.setData({
        showStatusTabs: productionLinkMode === 'order',
        showExcludeToggle: productionLinkMode === 'order',
        excludeCompleted: !!listDisplay.onlyShowNotCompleted,
        showPurchaseProgress: !!listDisplay.showPurchaseProgress,
        showDeliveryDate: listDisplay.showDeliveryDate !== false,
        filterActive: isFilterActive(
          this.data.statusFilter,
          !!listDisplay.onlyShowNotCompleted
        )
      });
      const _await$Promise$all = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll()]
        ),productsRaw = _await$Promise$all[0],categoriesRaw = _await$Promise$all[1];
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      this._productMap = new Map(products.map((p) => [p.id, p]));
      this._categoryMap = new Map(categories.map((c) => [c.id, c]));
      this._orders = await fetchAllOrdersPaginated({}).catch(() => []);
    } catch {
      this._productionLinkMode = 'order';
      this._showPurchaseProgress = false;
      this._categoryMap = new Map();
      this._orders = [];
    }
    await this.reloadList();
  },

  async reloadList() {
    this._allPlans = [];
    this._progressMap = new Map();
    if (!this._orders) {
      this._orders = await fetchAllOrdersPaginated({}).catch(() => []);
    }
    this.setData({ page: 1, rows: [], hasMore: false, loading: true });
    await this.loadPage(1, false);
  },

  mergeSortedPlans(pagePlans, append) {
    if (!append) return sortPlansNewestFirst(pagePlans);
    const byId = new Map((this._allPlans || []).map((p) => [p.id, p]));
    (pagePlans || []).forEach((p) => {
      if (p && p.id) byId.set(p.id, p);
    });
    return sortPlansNewestFirst([...byId.values()]);
  },

  async loadPage(page, append) {
    if (append) this.setData({ loadingMore: true });else
    if (!this.data.loading) this.setData({ loading: true });

    try {
      const params = buildListQuery({
        page,
        pageSize: this.data.pageSize,
        searchKeyword: this.data.searchKeyword,
        statusFilter: this.data.statusFilter,
        excludeCompleted: this.data.excludeCompleted,
        productionLinkMode: this._productionLinkMode || 'order'
      });
      const result = await listPlansPaginated(params);
      const pagePlans = result.data || [];
      this._allPlans = this.mergeSortedPlans(pagePlans, append);

      if (!this._progressMap) this._progressMap = new Map();
      if (this._showPurchaseProgress && pagePlans.length) {
        const req = buildPurchaseProgressRequest(pagePlans);
        const progressList = normalizeListBody(await fetchPlansPurchaseProgress(req));
        (progressList || []).forEach((p) => {
          if (p && p.planId) {
            this._progressMap.set(p.planId, { received: p.received, ordered: p.ordered });
          }
        });
      } else if (!append) {
        this._progressMap = new Map();
      }

      const pageRows = this.mapRowsFromPlans(this._allPlans);

      const loaded = pageRows.length;
      const hasMore = loaded < (result.total || 0);

      this.setData({
        rows: pageRows,
        page,
        total: result.total || 0,
        hasMore,
        emptyText: this.data.searchKeyword ? '无搜索结果' : '暂无生产计划'
      });
      this.setData({
        loading: false,
        loadingMore: false
      });
    } catch {
      this.setData({
        loading: false,
        loadingMore: false,
        rows: append ? this.data.rows : [],
        hasMore: false
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});