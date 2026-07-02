const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { normalizeListBody } = require('../../utils/listResponse.js');
const {
  DEFAULT_PAGE_SIZE,
  STATUS_FILTER_TABS,
} = require('../../config/productionPlans.js');
const {
  parsePlanSearch,
  mapPlanListRow,
  buildPurchaseProgressRequest,
  normalizeMasterList,
  productNameSkuParts,
} = require('../../utils/productionPlans.js');
const {
  listPlansPaginated,
  fetchPlansPurchaseProgress,
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
} = require('../../utils/planApi.js');
const { sortPlansNewestFirst } = require('../../utils/planOrderSort.js');
const { mapProductCustomTags } = require('../../utils/reportCustomDocField.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
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
    display: String(t.display || '').slice(0, 48),
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
  };
}

function buildListQuery({
  page,
  pageSize,
  searchKeyword,
  statusFilter,
  excludeCompleted,
  productionLinkMode,
}) {
  const parsed = parsePlanSearch(searchKeyword);
  const params = {
    page,
    pageSize,
  };
  if (parsed.search) params.search = parsed.search;
  if (productionLinkMode === 'order') {
    const dispatchStatus = parsed.dispatchStatus
      || (statusFilter && statusFilter !== 'all' ? statusFilter : undefined);
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
    emptyText: '暂无生产计划',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 120,
    showFilterPanel: false,
    filterActive: false,
  },

  _pendingStatusFilter: 'all',
  _pendingExcludeCompleted: false,

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });

    const planId = options.planId ? decodeURIComponent(options.planId) : '';
    if (planId) {
      this._loadingDetail = true;
      wx.redirectTo({
        url: `/pages/production-plan-detail/production-plan-detail?id=${encodeURIComponent(planId)}`,
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
      canCreate: hasPermission(ctx.permissions || [], 'production:plans:create')
        && hasPermission(ctx.permissions || [], 'basic:products:view'),
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
    wx.navigateTo({ url: '/pages/production-plan-create/production-plan-create' });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    this._filterSnapshot = {
      statusFilter: this.data.statusFilter,
      excludeCompleted: this.data.excludeCompleted,
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
      excludeCompleted: !!snap.excludeCompleted,
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
      filterActive: false,
    });
    this.reloadList();
  },

  onFilterApply() {
    const statusFilter = this._pendingStatusFilter != null
      ? this._pendingStatusFilter
      : this.data.statusFilter;
    const excludeCompleted = !!this._pendingExcludeCompleted;
    this._filterSnapshot = { statusFilter, excludeCompleted };
    this.setData({
      statusFilter,
      excludeCompleted,
      showFilterPanel: false,
      filterActive: isFilterActive(statusFilter, excludeCompleted),
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
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    this._pendingStatusFilter = id;
    if (this.data.showFilterPanel) {
      this.setData({ statusFilter: id });
      return;
    }
    if (id === this.data.statusFilter) return;
    this.setData({
      statusFilter: id,
      filterActive: isFilterActive(id, this.data.excludeCompleted),
    });
    this.reloadList();
  },

  onExcludeToggle() {
    const excludeCompleted = this.data.showFilterPanel
      ? !this._pendingExcludeCompleted
      : !this.data.excludeCompleted;
    if (this.data.showFilterPanel) {
      this._pendingExcludeCompleted = excludeCompleted;
      this.setData({ excludeCompleted });
      return;
    }
    this.setData({
      excludeCompleted,
      filterActive: isFilterActive(this.data.statusFilter, excludeCompleted),
    });
    this.reloadList();
  },

  onRowTap(e) {
    this.closeFilterPanel();
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/production-plan-detail/production-plan-detail?id=${encodeURIComponent(id)}`,
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
      categoryLabel: category && category.name ? category.name : '',
    };
  },

  mapRowsFromPlans(plans) {
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
        showDeliveryDate: this.data.showDeliveryDate,
      });
      return slimPlanListRow(row);
    });
  },

  onProductImageError(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    const rows = (this.data.rows || []).map((row) =>
      row.id === id ? { ...row, showProductImage: false } : row,
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
          !!listDisplay.onlyShowNotCompleted,
        ),
      });
      const [productsRaw, categoriesRaw] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
      ]);
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      this._productMap = new Map(products.map((p) => [p.id, p]));
      this._categoryMap = new Map(categories.map((c) => [c.id, c]));
    } catch {
      this._productionLinkMode = 'order';
      this._showPurchaseProgress = false;
      this._categoryMap = new Map();
    }
    await this.reloadList();
  },

  async reloadList() {
    this._allPlans = [];
    this._progressMap = new Map();
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
    if (append) this.setData({ loadingMore: true });
    else if (!this.data.loading) this.setData({ loading: true });

    try {
      const params = buildListQuery({
        page,
        pageSize: this.data.pageSize,
        searchKeyword: this.data.searchKeyword,
        statusFilter: this.data.statusFilter,
        excludeCompleted: this.data.excludeCompleted,
        productionLinkMode: this._productionLinkMode || 'order',
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

      const pageRows = this.mapRowsFromPlans(pagePlans);

      const loaded = append ? this.data.rows.length + pageRows.length : pageRows.length;
      const hasMore = loaded < (result.total || 0);

      this.setData({
        rows: append ? this.data.rows.concat(pageRows) : pageRows,
        page,
        total: result.total || 0,
        hasMore,
        emptyText: this.data.searchKeyword ? '无搜索结果' : '暂无生产计划',
      });
      this.setData({
        loading: false,
        loadingMore: false,
      });
    } catch {
      this.setData({
        loading: false,
        loadingMore: false,
        rows: append ? this.data.rows : [],
        hasMore: false,
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
