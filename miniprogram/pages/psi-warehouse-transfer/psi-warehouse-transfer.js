const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { DEFAULT_PAGE_SIZE, PSI_TRANSFER_TYPE } = require('../../config/warehouses.js');
const {
  parseTransferSearch,
  buildTransferListCards,
  filterTransferCards,
} = require('../../utils/warehouseTransfer.js');
const { groupRecordsByDocNumber } = require('../../utils/psiOpsAggregators.js');
const { fetchAllPsiRecords } = require('../../utils/psiApi.js');
const { fetchWarehousesAll } = require('../../utils/orderApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { consumeListRefreshOnShow, LIST_ROUTES } = require('../../utils/saveNavigation.js');

const HUB_LIST_ROUTE = LIST_ROUTES.PSI_WAREHOUSE_TRANSFER.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildWarehouseMap(warehouses) {
  const map = new Map();
  (warehouses || []).forEach((w) => {
    if (w && w.id) map.set(w.id, w);
  });
  return map;
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    cards: [],
    searchKeyword: '',
    canCreate: false,
    emptyText: '暂无调拨单',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    hasMore: false,
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
    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    if (docNumber) {
      wx.redirectTo({
        url: `/pages/psi-warehouse-transfer-detail/psi-warehouse-transfer-detail?docNumber=${encodeURIComponent(docNumber)}`,
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
    if (!hasPermission(ctx.permissions || [], 'psi:warehouse_transfer:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      canCreate: hasPermission(ctx.permissions || [], 'psi:warehouse_transfer:create'),
    });
    if (!this._initialized) {
      this.bootstrap();
    } else if (consumeListRefreshOnShow(this, HUB_LIST_ROUTE)) {
      this.bootstrap();
    }
  },

  onPullDownRefresh() {
    this.reloadList().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.loadPage(this.data.page + 1);
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onCreateTap() {
    if (!this.data.canCreate) {
      wx.showToast({ title: '暂无新建权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/psi-warehouse-transfer-edit/psi-warehouse-transfer-edit' });
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.loadPage(1), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.loadPage(1);
  },

  onCardTap(e) {
    const docNumber = e.currentTarget.dataset.docNumber;
    if (!docNumber) return;
    wx.navigateTo({
      url: `/pages/psi-warehouse-transfer-detail/psi-warehouse-transfer-detail?docNumber=${encodeURIComponent(docNumber)}`,
    });
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      const [records, warehouses] = await Promise.all([
        fetchAllPsiRecords(PSI_TRANSFER_TYPE),
        fetchWarehousesAll().catch(() => []),
      ]);
      this._records = records || [];
      this._warehouseMap = buildWarehouseMap(warehouses || []);
      await this.loadPage(1);
    } catch (err) {
      this.setData({ loading: false, cards: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  buildFilteredCards() {
    const groups = groupRecordsByDocNumber(this._records || [], PSI_TRANSFER_TYPE);
    const allRecords = Object.values(groups).flat();
    const cards = buildTransferListCards(allRecords, new Map(), this._warehouseMap);
    const parsed = parseTransferSearch(this.data.searchKeyword);
    return filterTransferCards(cards, parsed.search);
  },

  async reloadList() {
    if (!this._initialized) return this.bootstrap();
    this.setData({ loading: true, page: 1 });
    try {
      this._records = await fetchAllPsiRecords(PSI_TRANSFER_TYPE);
      return this.loadPage(1);
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '刷新失败', icon: 'none' });
    }
  },

  loadPage(page) {
    const allCards = this.buildFilteredCards();
    const pageSize = this.data.pageSize;
    const slice = allCards.slice(0, page * pageSize);
    const hasMore = slice.length < allCards.length;
    this.setData({
      loading: false,
      loadingMore: false,
      cards: slice,
      page,
      total: allCards.length,
      hasMore,
      emptyText: allCards.length ? '' : (this.data.searchKeyword ? '无匹配调拨单' : '暂无调拨单'),
    });
    return Promise.resolve();
  },
});
