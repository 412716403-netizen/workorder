const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  mapPaymentDetailView,
  buildCategoryMap,
  buildWorkerMap,
  categoriesForPayment,
} = require('../utils/financePayments.js');
const {
  getFinanceRecord,
  deleteFinanceRecord,
  fetchFinanceCategoriesAll,
  normalizeMasterList,
} = require('../../utils/financeApi.js');
const { fetchProductsAll } = require('../utils/planApi.js');
const { fetchWorkersAll } = require('../utils/orderApi.js');
const { buildProductMap } = require('../utils/purchaseOrders.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../utils/saveNavigation.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const webTailPx = Math.ceil((win.windowWidth / 750) * 16);
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
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const id = options.id ? decodeURIComponent(options.id) : '';
    const ctx = readTenantCtx();
    const canEdit = hasPermission((ctx && ctx.permissions) || [], 'finance:payment:edit');
    const canDelete = hasPermission((ctx && ctx.permissions) || [], 'finance:payment:delete');
    const showFooter = canEdit || canDelete;
    this.setData({
      id,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav, showFooter),
      canEdit,
      canDelete,
      showFooter,
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

  onEditTap() {
    if (!this.data.canEdit) return;
    wx.navigateTo({
      url: `/packageBusiness/finance-payment-edit/finance-payment-edit?id=${encodeURIComponent(this.data.id)}`,
    });
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this.data.id) return;
    const docNo = this.data.docNo || this.data.id;
    wx.showModal({
      title: '删除付款单',
      content: `确定删除 ${docNo}？`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        deleteFinanceRecord(this.data.id)
          .then(() => {
            wx.hideLoading();
            afterSaveReturnToList({
              listUrl: LIST_ROUTES.FINANCE_PAYMENTS,
              toastTitle: '已删除',
              alsoRefreshListUrls: [LIST_ROUTES.FINANCE_PAYMENT_FLOW],
            });
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      },
    });
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const [rec, categories, workers, products] = await Promise.all([
        getFinanceRecord(this.data.id),
        fetchFinanceCategoriesAll(),
        fetchWorkersAll().catch(() => []),
        fetchProductsAll().catch(() => []),
      ]);
      if (!rec || rec.type !== 'PAYMENT') {
        this.setData({ loading: false, found: false, docNo: '', sections: [] });
        return;
      }
      const cats = categoriesForPayment(normalizeMasterList(categories));
      const view = mapPaymentDetailView(rec, {
        categories: cats,
        categoryMap: buildCategoryMap(cats),
        workerMap: buildWorkerMap(normalizeMasterList(workers)),
        productMap: buildProductMap(products || []),
      });
      this.setData({
        loading: false,
        found: true,
        docNo: view.docNo,
        sections: view.sections,
      });
    } catch (err) {
      this.setData({ loading: false, found: false, docNo: '', sections: [] });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
