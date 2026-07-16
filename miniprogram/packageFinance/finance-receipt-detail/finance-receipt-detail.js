const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =




  require('../utils/financeReceipts.js'),mapReceiptDetailView = _require3.mapReceiptDetailView,buildCategoryMap = _require3.buildCategoryMap,buildWorkerMap = _require3.buildWorkerMap,categoriesForReceipt = _require3.categoriesForReceipt,normalizeFinanceCategories = _require3.normalizeFinanceCategories;
const _require4 =




  require('../../utils/financeApi.js'),getFinanceRecord = _require4.getFinanceRecord,deleteFinanceRecord = _require4.deleteFinanceRecord,fetchFinanceCategoriesAll = _require4.fetchFinanceCategoriesAll,normalizeMasterList = _require4.normalizeMasterList;
const _require5 = require('../../utils/planApi.js'),fetchProductsAll = _require5.fetchProductsAll;
const _require6 = require('../../utils/orderApi.js'),fetchWorkersAll = _require6.fetchWorkersAll;
const _require7 = require('../../utils/purchaseOrders.js'),buildProductMap = _require7.buildProductMap;
const _require8 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require8.readNavBarMetrics,readWindowMetrics = _require8.readWindowMetrics;
const _require9 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require9.LIST_ROUTES,afterSaveReturnToList = _require9.afterSaveReturnToList;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const webTailPx = Math.ceil(win.windowWidth / 750 * 16);
  return nav.statusBarHeight + nav.navBarHeight + webTailPx;
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
    id: '',
    docNo: '',
    found: false,
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
    const id = options.id ? decodeURIComponent(options.id) : '';
    const ctx = readTenantCtx();
    const canEdit = hasPermission(ctx && ctx.permissions || [], 'finance:receipt:edit');
    const canDelete = hasPermission(ctx && ctx.permissions || [], 'finance:receipt:delete');
    const showFooter = canEdit || canDelete;
    this.setData({
      id,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav, showFooter),
      canEdit,
      canDelete,
      showFooter
    });
    if (!id) {
      wx.showToast({ title: '缺少单据', icon: 'none' });
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

  onPreviewCustomImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url || String(url).indexOf('data:image/') !== 0) return;
    const urls = [];
    (this.data.sections || []).forEach((sec) => {
      (sec.rows || []).forEach((row) => {
        if (row && row.isImage && row.imageUrl) urls.push(row.imageUrl);
      });
    });
    wx.previewImage({
      current: url,
      urls: urls.length ? urls : [url],
    });
  },

  onEditTap() {
    if (!this.data.canEdit) return;
    wx.navigateTo({
      url: `/packageFinance/finance-receipt-edit/finance-receipt-edit?id=${encodeURIComponent(this.data.id)}`
    });
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this.data.id) return;
    const docNo = this.data.docNo || this.data.id;
    wx.showModal({
      title: '删除收款单',
      content: `确定删除 ${docNo}？`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        deleteFinanceRecord(this.data.id).
        then(() => {
          wx.hideLoading();
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.FINANCE_RECEIPTS,
            toastTitle: '已删除',
            alsoRefreshListUrls: [LIST_ROUTES.FINANCE_RECEIPT_FLOW]
          });
        }).
        catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
      }
    });
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        getFinanceRecord(this.data.id),
        fetchFinanceCategoriesAll(),
        fetchWorkersAll().catch(() => []),
        fetchProductsAll().catch(() => [])]
        ),rec = _await$Promise$all[0],categories = _await$Promise$all[1],workers = _await$Promise$all[2],products = _await$Promise$all[3];
      if (!rec || rec.type !== 'RECEIPT') {
        this.setData({ loading: false, found: false, docNo: '', sections: [] });
        return;
      }
      const cats = categoriesForReceipt(normalizeFinanceCategories(normalizeMasterList(categories)));
      const view = mapReceiptDetailView(rec, {
        categories: cats,
        categoryMap: buildCategoryMap(cats),
        workerMap: buildWorkerMap(normalizeMasterList(workers)),
        productMap: buildProductMap(products || [])
      });
      this.setData({
        loading: false,
        found: true,
        docNo: view.docNo,
        sections: view.sections
      });
    } catch (err) {
      this.setData({ loading: false, found: false, docNo: '', sections: [] });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});