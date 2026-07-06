const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { PSI_STOCKTAKE_TYPE } = require('../../config/warehouses.js');
const { mapStocktakeDetailView } = require('../../utils/warehouseStocktake.js');
const { groupRecordsByDocNumber } = require('../../utils/psiOpsAggregators.js');
const { fetchAllPsiRecords, deletePsiRecords } = require('../../utils/psiApi.js');
const { fetchProductsAll, fetchCategoriesAll, fetchDictionaries } = require('../../utils/planApi.js');
const { fetchWarehousesAll } = require('../../utils/orderApi.js');
const { buildProductMap, buildCategoryMap } = require('../../utils/purchaseOrders.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = hasFooter ? Math.ceil(120 * rpx) + (win.safeAreaBottom || 0) : 0;
  return Math.max(200, (win.windowHeight || 667) - computeHeaderBlockHeight(nav) - footerPx);
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
    title: '盘点单详情',
    docNumber: '',
    hero: null,
    summaryStats: null,
    sections: [],
    canEdit: false,
    canDelete: false,
    showFooter: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    const ctx = readTenantCtx();
    const canEdit = hasPermission((ctx && ctx.permissions) || [], 'psi:warehouse_stocktake:edit');
    const canDelete = hasPermission((ctx && ctx.permissions) || [], 'psi:warehouse_stocktake:delete');
    const showFooter = canEdit || canDelete;
    this.setData({
      docNumber,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav, showFooter),
      canEdit,
      canDelete,
      showFooter,
    });
    if (!docNumber) {
      wx.showToast({ title: '缺少单号', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.loadDetail();
  },

  onShow() {
    if (this._refreshOnNextShow) {
      this._refreshOnNextShow = false;
      this.loadDetail();
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onEditTap() {
    if (!this.data.canEdit) return;
    wx.navigateTo({
      url: `/pages/psi-warehouse-stocktake-edit/psi-warehouse-stocktake-edit?docNumber=${encodeURIComponent(this.data.docNumber)}`,
    });
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._recordIds || !this._recordIds.length) return;
    wx.showModal({
      title: '删除盘点单',
      content: `确定删除 ${this.data.docNumber}？`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        deletePsiRecords(this._recordIds)
          .then(() => {
            wx.hideLoading();
            afterSaveReturnToList({
              listUrl: LIST_ROUTES.PSI_WAREHOUSE_STOCKTAKE,
              toastTitle: '已删除',
              alsoRefreshListUrls: [LIST_ROUTES.PSI_WAREHOUSES, LIST_ROUTES.PSI_WAREHOUSE_FLOW],
            });
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      },
    });
  },

  onProductImageError(e) {
    const lineGroupId = e.currentTarget.dataset.lineGroupId;
    const sections = (this.data.sections || []).map((sec) => {
      if (!sec.lines) return sec;
      return {
        ...sec,
        lines: (sec.lines || []).map((line) => {
          if (line.lineGroupId !== lineGroupId) return line;
          return { ...line, showProductImage: false };
        }),
      };
    });
    this.setData({ sections });
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const [records, products, categories, dictionaries, warehouses] = await Promise.all([
        fetchAllPsiRecords(PSI_STOCKTAKE_TYPE),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => []),
      ]);
      const groups = groupRecordsByDocNumber(records || [], PSI_STOCKTAKE_TYPE);
      const items = groups[this.data.docNumber];
      if (!items || !items.length) {
        this.setData({ loading: false, hero: null, sections: [] });
        wx.showToast({ title: '未找到盘点单', icon: 'none' });
        return;
      }
      this._recordIds = items.map((r) => r.id);
      const view = mapStocktakeDetailView(
        this.data.docNumber,
        items,
        buildProductMap(products || []),
        buildCategoryMap(categories || []),
        buildWarehouseMap(warehouses || []),
        normalizeAppDictionaries(dictionaries),
      );
      this.setData({
        loading: false,
        hero: view.hero,
        summaryStats: view.summaryStats,
        sections: view.sections,
        title: view.hero.docNumber || '盘点单详情',
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
