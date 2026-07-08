const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/salesOrders.js'),PSI_TYPE = _require3.PSI_TYPE;
const _require4 =



  require('../utils/salesOrders.js'),mapSalesOrderDetailView = _require4.mapSalesOrderDetailView,buildProductMap = _require4.buildProductMap,buildCategoryMap = _require4.buildCategoryMap;
const _require5 = require('../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require5.groupRecordsByDocNumber;
const _require6 = require('../utils/psiApi.js'),fetchAllPsiRecords = _require6.fetchAllPsiRecords,deletePsiRecords = _require6.deletePsiRecords;
const _require7 = require('../utils/planApi.js'),fetchProductsAll = _require7.fetchProductsAll,fetchCategoriesAll = _require7.fetchCategoriesAll,fetchDictionaries = _require7.fetchDictionaries;
const _require8 = require('../utils/productionPlans.js'),normalizeAppDictionaries = _require8.normalizeAppDictionaries;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;
const _require0 = require('../utils/saveNavigation.js'),LIST_ROUTES = _require0.LIST_ROUTES,afterSaveReturnToList = _require0.afterSaveReturnToList;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil(win.windowWidth / 750 * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = hasFooter ? Math.ceil(120 * rpx) + (win.safeAreaBottom || 0) : 0;
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

Page({
  data: {
    loading: true,
    title: '销售订单详情',
    docNumber: '',
    hero: null,
    summaryStats: null,
    sections: [],
    canEdit: false,
    canDelete: false,
    canAllocate: false,
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
    const perms = ctx && ctx.permissions || [];
    const canEdit = hasPermission(perms, 'psi:sales_order:edit');
    const canDelete = hasPermission(perms, 'psi:sales_order:delete');
    const canAllocate = hasPermission(perms, 'psi:sales_order_allocation:allow');
    const showFooter = canEdit || canDelete;
    this.setData({
      docNumber,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav, showFooter),
      canEdit,
      canDelete,
      canAllocate,
      showFooter,
      canViewAmount: hasPermission(perms, 'psi:sales_order:amount')
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
      url: `/packageBusiness/psi-sales-order-edit/psi-sales-order-edit?docNumber=${encodeURIComponent(this.data.docNumber)}`
    });
  },

  onAllocateTap(e) {
    if (!this.data.canAllocate) return;
    const lineGroupId = e.currentTarget.dataset.lineGroupId;
    if (!lineGroupId) return;
    wx.navigateTo({
      url: `/packageBusiness/psi-sales-order-allocate/psi-sales-order-allocate?docNumber=${encodeURIComponent(this.data.docNumber)}&lineGroupId=${encodeURIComponent(lineGroupId)}`
    });
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._recordIds || !this._recordIds.length) return;
    wx.showModal({
      title: '删除销售订单',
      content: `确定删除 ${this.data.docNumber}？`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        deletePsiRecords(this._recordIds).
        then(() => {
          wx.hideLoading();
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.PSI_SALES_ORDERS,
            toastTitle: '已删除'
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
      if (sec.id !== 'lines') return sec;
      return {
        ...sec,
        rows: (sec.rows || []).map((row) => {
          if (row.lineGroupId !== lineGroupId) return row;
          return { ...row, showProductImage: false };
        })
      };
    });
    this.setData({ sections });
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({}))]
        ),salesOrders = _await$Promise$all[0],products = _await$Promise$all[1],categories = _await$Promise$all[2],dictionaries = _await$Promise$all[3];
      const groups = groupRecordsByDocNumber(salesOrders || [], PSI_TYPE);
      const items = groups[this.data.docNumber];
      if (!items || !items.length) {
        this.setData({ loading: false, hero: null, sections: [] });
        wx.showToast({ title: '未找到订单', icon: 'none' });
        return;
      }
      this._recordIds = items.map((r) => r.id);
      const productMap = buildProductMap(products || []);
      const categoryMap = buildCategoryMap(categories || []);
      const view = mapSalesOrderDetailView(this.data.docNumber, items, {
        productMap,
        categoryMap,
        dictionaries: normalizeAppDictionaries(dictionaries),
        showAmount: this.data.canViewAmount,
        canAllocate: this.data.canAllocate
      });
      this.setData({
        loading: false,
        hero: view.hero,
        summaryStats: view.summaryStats,
        sections: view.sections,
        title: view.hero.docNumberDisplay || '销售订单详情'
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});