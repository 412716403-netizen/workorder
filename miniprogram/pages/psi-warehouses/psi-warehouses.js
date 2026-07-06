const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  DEFAULT_PAGE_SIZE,
  INVENTORY_VIEW_MODES,
  WAREHOUSE_SHORTCUTS,
} = require('../../config/warehouses.js');
const {
  buildProductStockRows,
  filterProductStocks,
  buildVisibleProductStocks,
  buildWarehouseCards,
  buildProductCards,
  paginateItems,
} = require('../../utils/warehouseInventory.js');
const { buildStockSnapshotIndex } = require('../../utils/warehouseStock.js');
const { buildProductMap, buildCategoryMap } = require('../../utils/purchaseOrders.js');
const { fetchStockSnapshot, fetchStockBatches } = require('../../utils/orderApi.js');
const { fetchProductsAll, fetchCategoriesAll, fetchDictionaries } = require('../../utils/planApi.js');
const { fetchWarehousesAll } = require('../../utils/orderApi.js');
const { normalizeAppDictionaries, normalizeMasterList } = require('../../utils/productionPlans.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { consumeListRefreshOnShow, LIST_ROUTES } = require('../../utils/saveNavigation.js');

const HUB_LIST_ROUTE = LIST_ROUTES.PSI_WAREHOUSES.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    viewMode: 'warehouse',
    viewModeIndex: 0,
    viewModeLabels: INVENTORY_VIEW_MODES.map((m) => m.label),
    selectedWarehouseId: '',
    selectedWarehouseName: '',
    searchKeyword: '',
    warehouseCards: [],
    productCards: [],
    drillLines: [],
    shortcuts: [],
    emptyText: '暂无库存数据',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    hasMore: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });
    this._initialized = false;
    this._searchTimer = null;
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
    if (!hasPermission(ctx.permissions || [], 'psi:warehouse_list:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    const perms = ctx.permissions || [];
    const shortcuts = WAREHOUSE_SHORTCUTS.filter(
      (s) => !s.permission || hasPermission(perms, s.permission),
    );
    this.setData({ shortcuts });
    if (!this._initialized) {
      this.bootstrap();
    } else if (consumeListRefreshOnShow(this, HUB_LIST_ROUTE)) {
      this.bootstrap();
    }
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    this.loadMore();
  },

  onHeaderBack() {
    if (this.data.selectedWarehouseId) {
      this.setData({ selectedWarehouseId: '', selectedWarehouseName: '', drillLines: [] });
      return;
    }
    wx.navigateBack();
  },

  onViewModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.viewMode) return;
    const idx = INVENTORY_VIEW_MODES.findIndex((m) => m.value === mode);
    this.setData({
      viewModeIndex: idx >= 0 ? idx : 0,
      viewMode: mode,
      selectedWarehouseId: '',
      selectedWarehouseName: '',
      drillLines: [],
      page: 1,
    });
    this.applyList();
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword, page: 1 });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.applyList(), 300);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '', page: 1 });
    this.applyList();
  },

  onShortcutTap(e) {
    const path = e.currentTarget.dataset.path;
    if (path) wx.navigateTo({ url: path });
  },

  onWarehouseCardTap(e) {
    const { warehouseId, warehouseName } = e.currentTarget.dataset;
    const card = (this._allWarehouseCards || []).find((c) => c.warehouseId === warehouseId);
    this.setData({
      selectedWarehouseId: warehouseId,
      selectedWarehouseName: warehouseName,
      drillLines: card ? card.lines : [],
      page: 1,
    });
  },

  onProductFlowTap(e) {
    const { productId, warehouseId } = e.currentTarget.dataset;
    if (!productId) return;
    const q = [`productId=${encodeURIComponent(productId)}`];
    if (warehouseId) q.push(`warehouseId=${encodeURIComponent(warehouseId)}`);
    wx.navigateTo({ url: `/pages/psi-warehouse-product-flow/psi-warehouse-product-flow?${q.join('&')}` });
  },

  onToggleProductExpand(e) {
    const productId = e.currentTarget.dataset.productId;
    const cards = (this.data.productCards || []).map((c) =>
      (c.productId === productId ? { ...c, detailsExpanded: !c.detailsExpanded } : c));
    this.setData({ productCards: cards });
  },

  onToggleLineExpand(e) {
    const { productId, warehouseId } = e.currentTarget.dataset;
    const wid = warehouseId || this.data.selectedWarehouseId;
    const line = (this.data.drillLines || []).find((l) => l.productId === productId);
    if (!line || !line.canExpand) return;
    if (line.detailsExpanded) {
      this.setData({
        drillLines: (this.data.drillLines || []).map((l) =>
          (l.productId === productId
            ? { ...l, detailsExpanded: false, batchRows: [], batchLoading: false, batchError: '' }
            : l)),
      });
      return;
    }
    if (line.usesBatch) {
      this.loadBatchBreakdown(productId, wid);
      return;
    }
    this.setData({
      drillLines: (this.data.drillLines || []).map((l) =>
        (l.productId === productId ? { ...l, detailsExpanded: true } : l)),
    });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [snapshotRaw, warehouses, products, categories, dictionaries] = await Promise.all([
        fetchStockSnapshot().catch(() => ({ byWarehouse: [], byVariant: [], byBatch: [] })),
        fetchWarehousesAll().catch(() => []),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
      ]);
      this._products = normalizeMasterList(products);
      this._categories = normalizeMasterList(categories);
      this._warehouses = Array.isArray(warehouses) ? warehouses : (warehouses.data || []);
      this._productMap = buildProductMap(this._products);
      this._categoryMap = buildCategoryMap(this._categories);
      this._warehouseMap = new Map(this._warehouses.map((w) => [w.id, w]));
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      this._stockIndex = buildStockSnapshotIndex(snapshotRaw || {});
      this._productStocks = buildProductStockRows(
        this._products,
        this._warehouses,
        this._categories,
        this._dictionaries,
        this._stockIndex,
      );
      this._initialized = true;
      this.applyList();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[psi-warehouses bootstrap]', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false, warehouseCards: [], productCards: [] });
    }
  },

  applyList() {
    if (!this._stockIndex || !this._productMap) return;
    const filtered = filterProductStocks(
      this._productStocks || [],
      this.data.searchKeyword,
      this._productMap,
    );
    const visible = buildVisibleProductStocks(filtered);
    this._allWarehouseCards = buildWarehouseCards(
      this._warehouses,
      visible,
      this._productMap,
    );
    this._allProductCards = buildProductCards(visible, this._productMap);

    if (this.data.selectedWarehouseId) {
      const card = this._allWarehouseCards.find((c) => c.warehouseId === this.data.selectedWarehouseId);
      this._paginateSource = card ? card.lines : [];
    } else if (this.data.viewMode === 'warehouse') {
      this._paginateSource = this._allWarehouseCards;
    } else {
      this._paginateSource = this._allProductCards;
    }
    this.renderPage(1);
  },

  renderPage(page) {
    const { items, hasMore, total } = paginateItems(this._paginateSource || [], page, this.data.pageSize);
    const patch = {
      loading: false,
      page,
      hasMore,
      emptyText: total ? '' : '暂无库存数据',
    };
    if (this.data.selectedWarehouseId) {
      patch.drillLines = page === 1 ? items : (this.data.drillLines || []).concat(items);
    } else if (this.data.viewMode === 'warehouse') {
      patch.warehouseCards = page === 1 ? items : (this.data.warehouseCards || []).concat(items);
    } else {
      patch.productCards = page === 1 ? items : (this.data.productCards || []).concat(items);
    }
    this.setData(patch);
  },

  loadMore() {
    this.renderPage((this.data.page || 1) + 1);
  },

  async loadBatchBreakdown(productId, warehouseId) {
    this.setData({
      drillLines: (this.data.drillLines || []).map((line) => {
        if (line.productId !== productId) return line;
        return {
          ...line,
          detailsExpanded: true,
          batchLoading: true,
          batchError: '',
          batchRows: [],
        };
      }),
    });

    try {
      const rows = await fetchStockBatches({ productId, warehouseId });
      const batchRows = (rows || []).map((r) => ({
        batchNo: r.batchNo || '—',
        stockText: String(r.stock ?? 0),
      }));
      this.setData({
        drillLines: (this.data.drillLines || []).map((line) => {
          if (line.productId !== productId) return line;
          return {
            ...line,
            detailsExpanded: true,
            batchLoading: false,
            batchRows,
            batchError: '',
          };
        }),
      });
    } catch (err) {
      const msg = (err && err.message) || '加载批次失败';
      this.setData({
        drillLines: (this.data.drillLines || []).map((line) => {
          if (line.productId !== productId) return line;
          return {
            ...line,
            detailsExpanded: true,
            batchLoading: false,
            batchError: msg,
            batchRows: [],
          };
        }),
      });
    }
  },
});
