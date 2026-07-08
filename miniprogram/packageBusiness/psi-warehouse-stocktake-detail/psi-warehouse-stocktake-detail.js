const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/warehouses.js'),PSI_STOCKTAKE_TYPE = _require3.PSI_STOCKTAKE_TYPE;
const _require4 = require('../utils/warehouseStocktake.js'),mapStocktakeDetailView = _require4.mapStocktakeDetailView;
const _require5 = require('../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require5.groupRecordsByDocNumber;
const _require6 = require('../utils/psiApi.js'),fetchAllPsiRecords = _require6.fetchAllPsiRecords,deletePsiRecords = _require6.deletePsiRecords;
const _require7 = require('../utils/planApi.js'),fetchProductsAll = _require7.fetchProductsAll,fetchCategoriesAll = _require7.fetchCategoriesAll,fetchDictionaries = _require7.fetchDictionaries;
const _require8 = require('../utils/orderApi.js'),fetchWarehousesAll = _require8.fetchWarehousesAll;
const _require9 = require('../utils/purchaseOrders.js'),buildProductMap = _require9.buildProductMap,buildCategoryMap = _require9.buildCategoryMap;
const _require0 = require('../utils/productionPlans.js'),normalizeAppDictionaries = _require0.normalizeAppDictionaries;
const _require1 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require1.readNavBarMetrics,readWindowMetrics = _require1.readWindowMetrics;
const _require10 = require('../utils/saveNavigation.js'),LIST_ROUTES = _require10.LIST_ROUTES,afterSaveReturnToList = _require10.afterSaveReturnToList;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil(win.windowWidth / 750 * 16);
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
    scrollHeight: 500
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    const ctx = readTenantCtx();
    const canEdit = hasPermission(ctx && ctx.permissions || [], 'psi:warehouse_stocktake:edit');
    const canDelete = hasPermission(ctx && ctx.permissions || [], 'psi:warehouse_stocktake:delete');
    const showFooter = canEdit || canDelete;
    this.setData({
      docNumber,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav, showFooter),
      canEdit,
      canDelete,
      showFooter
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
      url: `/packageBusiness/psi-warehouse-stocktake-edit/psi-warehouse-stocktake-edit?docNumber=${encodeURIComponent(this.data.docNumber)}`
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
        deletePsiRecords(this._recordIds).
        then(() => {
          wx.hideLoading();
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.PSI_WAREHOUSE_STOCKTAKE,
            toastTitle: '已删除',
            alsoRefreshListUrls: [LIST_ROUTES.PSI_WAREHOUSES, LIST_ROUTES.PSI_WAREHOUSE_FLOW]
          });
        }).
        catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
      }
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
        })
      };
    });
    this.setData({ sections });
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchAllPsiRecords(PSI_STOCKTAKE_TYPE),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => [])]
        ),records = _await$Promise$all[0],products = _await$Promise$all[1],categories = _await$Promise$all[2],dictionaries = _await$Promise$all[3],warehouses = _await$Promise$all[4];
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
        normalizeAppDictionaries(dictionaries)
      );
      this.setData({
        loading: false,
        hero: view.hero,
        summaryStats: view.summaryStats,
        sections: view.sections,
        title: view.hero.docNumber || '盘点单详情'
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});