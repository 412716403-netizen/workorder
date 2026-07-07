const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { PRODUCT_ARCHIVE_ALL, DEFAULT_PAGE_SIZE } = require('../config/products.js');
const { buildProductListRows } = require('../utils/products.js');
const { fetchProductsAll, updateProduct } = require('../utils/productApi.js');
const {
  fetchCategoriesAll,
} = require('../utils/planApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { shouldHubListRefetch, trackHubListHidden, LIST_ROUTES } = require('../utils/saveNavigation.js');
const { isProductEnabled } = require('../utils/productEnabled.js');

const HUB_LIST_ROUTE = LIST_ROUTES.BASIC_PRODUCTS.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildSearchHint(filteredTotal, inCategoryCount, searchKeyword, page, totalPages) {
  const q = String(searchKeyword || '').trim();
  if (!q && totalPages <= 1) return '';
  const parts = [];
  if (q) {
    parts.push(`找到 ${filteredTotal} 条`);
    if (filteredTotal < inCategoryCount) parts.push(`（共 ${inCategoryCount} 条）`);
  }
  if (totalPages > 1) parts.push(`第 ${page}/${totalPages} 页`);
  return parts.join(' · ');
}

Page({
  data: {
    loading: true,
    rows: [],
    categoryTabs: [],
    searchKeyword: '',
    activeCategoryId: PRODUCT_ARCHIVE_ALL,
    emptyText: '暂无产品',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalPages: 1,
    filteredTotal: 0,
    searchHint: '',
    canCreate: false,
    canEdit: false,
    togglingId: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });

    const productId = options.productId ? decodeURIComponent(options.productId) : '';
    if (productId) {
      wx.redirectTo({
        url: `/packageBusiness/basic-product-edit/basic-product-edit?id=${encodeURIComponent(productId)}`,
      });
      return;
    }
    this._initialized = false;
    this._products = [];
    this._categories = [];
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
      canCreate: hasPermission(ctx.permissions || [], 'basic:products:create'),
      canEdit: hasPermission(ctx.permissions || [], 'basic:products:edit'),
    });
    if (!this._initialized) {
      this.bootstrap();
    } else if (shouldHubListRefetch(this, HUB_LIST_ROUTE)) {
      this.bootstrap();
    }
  },

  onHide() {
    trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onCreateTap() {
    if (!this.data.canCreate) {
      wx.showToast({ title: '暂无新建权限', icon: 'none' });
      return;
    }
    this.openProductEdit('/packageBusiness/basic-product-edit/basic-product-edit');
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword, page: 1 });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.reloadList(), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '', page: 1 });
    this.reloadList();
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.activeCategoryId) return;
    this.setData({ activeCategoryId: id, page: 1 });
    this.reloadList();
  },

  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (!this.data.canEdit) {
      wx.showToast({ title: '暂无编辑权限', icon: 'none' });
      return;
    }
    this.openProductEdit(
      `/packageBusiness/basic-product-edit/basic-product-edit?id=${encodeURIComponent(id)}`,
    );
  },

  openProductEdit(url) {
    wx.navigateTo({
      url,
      events: {
        hubListChanged: () => {
          this.bootstrap();
        },
      },
    });
  },

  onPrevPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 });
    this.reloadList();
  },

  onNextPage() {
    if (this.data.page >= this.data.totalPages) return;
    this.setData({ page: this.data.page + 1 });
    this.reloadList();
  },

  onProductImageError(e) {
    const id = e.currentTarget.dataset.id;
    const rows = (this.data.rows || []).map((row) => {
      if (row.id !== id) return row;
      return { ...row, showProductImage: false };
    });
    this.setData({ rows });
  },

  async onToggleEnabled(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || !this.data.canEdit || this.data.togglingId) return;
    const product = (this._products || []).find((p) => p.id === id);
    if (!product) return;
    const nextEnabled = !isProductEnabled(product);
    this.setData({ togglingId: id });
    try {
      await updateProduct(id, { enabled: nextEnabled });
      this._products = (this._products || []).map((p) => (
        p.id === id ? { ...p, enabled: nextEnabled } : p
      ));
      wx.showToast({ title: nextEnabled ? '已启用' : '已禁用', icon: 'success' });
      this.reloadList();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    } finally {
      this.setData({ togglingId: '' });
    }
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      const [products, categories] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
      ]);
      this._products = products || [];
      this._categories = categories || [];
      this.reloadList();
    } catch {
      this.setData({ loading: false, rows: [], emptyText: '加载失败' });
    }
  },

  reloadList() {
    const inCategoryCount = this.data.activeCategoryId === PRODUCT_ARCHIVE_ALL
      ? (this._products || []).length
      : (this._products || []).filter((p) => p.categoryId === this.data.activeCategoryId).length;

    const result = buildProductListRows(
      this._products,
      this._categories,
      this.data.activeCategoryId,
      this.data.searchKeyword,
      this.data.page,
      this.data.pageSize,
    );

    const emptyText = inCategoryCount === 0
      ? '该分类下暂无产品'
      : (String(this.data.searchKeyword || '').trim() ? '未找到匹配的产品' : '该分类下暂无产品');

    this.setData({
      loading: false,
      rows: result.rows,
      categoryTabs: result.categoryTabs,
      page: result.page,
      totalPages: result.totalPages,
      filteredTotal: result.filteredTotal,
      searchHint: buildSearchHint(
        result.filteredTotal,
        inCategoryCount,
        this.data.searchKeyword,
        result.page,
        result.totalPages,
      ),
      emptyText,
    });
  },
});
