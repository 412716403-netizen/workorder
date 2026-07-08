const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/purchaseOrders.js'),PSI_TYPE = _require3.PSI_TYPE,PSI_BILL_TYPE = _require3.PSI_BILL_TYPE;
const _require4 =



  require('../utils/purchaseOrders.js'),mapPurchaseOrderDetailView = _require4.mapPurchaseOrderDetailView,buildProductMap = _require4.buildProductMap,buildCategoryMap = _require4.buildCategoryMap;
const _require5 = require('../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require5.groupRecordsByDocNumber,sumReceivedByOrderLine = _require5.sumReceivedByOrderLine;
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
    title: '采购订单详情',
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
    const canEdit = hasPermission(ctx && ctx.permissions || [], 'psi:purchase_order:edit');
    const canDelete = hasPermission(ctx && ctx.permissions || [], 'psi:purchase_order:delete');
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
      canViewAmount: hasPermission(ctx && ctx.permissions || [], 'psi:purchase_order:amount')
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
      url: `/packageBusiness/psi-purchase-order-edit/psi-purchase-order-edit?docNumber=${encodeURIComponent(this.data.docNumber)}`
    });
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._recordIds || !this._recordIds.length) return;
    wx.showModal({
      title: '删除采购订单',
      content: `确定删除 ${this.data.docNumber}？`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        deletePsiRecords(this._recordIds).
        then(() => {
          wx.hideLoading();
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.PSI_PURCHASE_ORDERS,
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
        fetchAllPsiRecords(PSI_BILL_TYPE),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({}))]
        ),purchaseOrders = _await$Promise$all[0],purchaseBills = _await$Promise$all[1],products = _await$Promise$all[2],categories = _await$Promise$all[3],dictionaries = _await$Promise$all[4];
      const groups = groupRecordsByDocNumber(purchaseOrders || [], PSI_TYPE);
      const items = groups[this.data.docNumber];
      if (!items || !items.length) {
        this.setData({ loading: false, hero: null, sections: [] });
        wx.showToast({ title: '未找到订单', icon: 'none' });
        return;
      }
      this._recordIds = items.map((r) => r.id);
      const productMap = buildProductMap(products || []);
      const categoryMap = buildCategoryMap(categories || []);
      const receivedByOrderLine = sumReceivedByOrderLine(purchaseBills || []);
      const view = mapPurchaseOrderDetailView(this.data.docNumber, items, {
        productMap,
        categoryMap,
        dictionaries: normalizeAppDictionaries(dictionaries),
        receivedByOrderLine,
        showAmount: this.data.canViewAmount
      });
      this.setData({
        loading: false,
        hero: view.hero,
        summaryStats: view.summaryStats,
        sections: view.sections,
        title: view.hero.docNumberDisplay || '采购订单详情'
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});