const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/salesBills.js'),PSI_TYPE = _require3.PSI_TYPE;
const _require4 = require('../utils/salesBills.js'),mapSalesBillDetailView = _require4.mapSalesBillDetailView;
const _require5 = require('../../utils/purchaseOrders.js'),buildProductMap = _require5.buildProductMap,buildCategoryMap = _require5.buildCategoryMap;
const _require6 = require('../../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require6.groupRecordsByDocNumber;
const _require7 = require('../../utils/psiApi.js'),fetchAllPsiRecords = _require7.fetchAllPsiRecords,deletePsiRecords = _require7.deletePsiRecords;
const _require8 = require('../../utils/planApi.js'),fetchProductsAll = _require8.fetchProductsAll,fetchCategoriesAll = _require8.fetchCategoriesAll,fetchDictionaries = _require8.fetchDictionaries;
const _require9 = require('../../utils/orderApi.js'),fetchWarehousesAll = _require9.fetchWarehousesAll;
const _require0 = require('../../utils/productionPlans.js'),normalizeAppDictionaries = _require0.normalizeAppDictionaries;
const _require1 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require1.readNavBarMetrics,readWindowMetrics = _require1.readWindowMetrics;
const _require10 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require10.LIST_ROUTES,afterSaveReturnToList = _require10.afterSaveReturnToList;
const { fetchPsiDocLinkedFinanceAmount } = require('../../utils/psiDocFinance.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const { openTodoEdit } = require('../../utils/todosApi.js');

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
    title: '销售单详情',
    docNumber: '',
    hero: null,
    summaryStats: null,
    sections: [],
    canEdit: false,
    canDelete: false,
    showFooter: false,
    showTodoBtn: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    const ctx = readTenantCtx();
    const canEdit = hasPermission(ctx && ctx.permissions || [], 'psi:sales_bill:edit');
    const canDelete = hasPermission(ctx && ctx.permissions || [], 'psi:sales_bill:delete');
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
      canViewAmount: hasPermission(ctx && ctx.permissions || [], 'psi:sales_bill:amount')
    });
    if (!docNumber) {
      wx.showToast({ title: '缺少单号', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    loadFeaturePlugins().then((plugins) => {
      this.setData({ showTodoBtn: isPluginEnabled(plugins, 'todo_reminder') });
    });
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

  onAddTodoTap() {
    if (!this.data.showTodoBtn || !this.data.docNumber) return;
    const partner = (this.data.hero && this.data.hero.partner) || '';
    const doc = this.data.docNumber;
    const partnerOk = partner && partner !== '—';
    openTodoEdit({
      seed: {
        sourceType: 'sales_bill',
        sourceId: doc,
        sourceDocNo: '销售单',
        sourceTitle: partnerOk ? `${doc} · ${partner}` : doc,
        href: `/psi?tab=SALES_BILL&psiDoc=${encodeURIComponent(doc)}`,
      },
    });
  },

  onEditTap() {
    if (!this.data.canEdit) return;
    wx.navigateTo({
      url: `/packagePsi/psi-sales-bill-edit/psi-sales-bill-edit?docNumber=${encodeURIComponent(this.data.docNumber)}`
    });
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._recordIds || !this._recordIds.length) return;
    wx.showModal({
      title: '删除销售单',
      content: `确定删除 ${this.data.docNumber}？`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        deletePsiRecords(this._recordIds).
        then(() => {
          wx.hideLoading();
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.PSI_SALES_BILLS,
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

  /** 关联收/付款合计（无财务查看权限或失败时为 0，界面则不展示该行） */
  loadLinkedFinanceAmount() {
    const ctx = readTenantCtx();
    return fetchPsiDocLinkedFinanceAmount(PSI_TYPE, this.data.docNumber, {
      tenantRole: ctx && ctx.tenantRole,
      permissions: ctx && ctx.permissions || []
    });
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => []),
        this.loadLinkedFinanceAmount()]
        ),salesBills = _await$Promise$all[0],products = _await$Promise$all[1],categories = _await$Promise$all[2],dictionaries = _await$Promise$all[3],warehouses = _await$Promise$all[4],linkedFinanceAmount = _await$Promise$all[5];
      const groups = groupRecordsByDocNumber(salesBills || [], PSI_TYPE);
      const items = groups[this.data.docNumber];
      if (!items || !items.length) {
        this.setData({ loading: false, hero: null, sections: [] });
        wx.showToast({ title: '未找到销售单', icon: 'none' });
        return;
      }
      this._recordIds = items.map((r) => r.id);
      const productMap = buildProductMap(products || []);
      const categoryMap = buildCategoryMap(categories || []);
      const whList = Array.isArray(warehouses) ? warehouses : warehouses.data || [];
      const view = mapSalesBillDetailView(this.data.docNumber, items, {
        linkedFinanceAmount,
        productMap,
        categoryMap,
        dictionaries: normalizeAppDictionaries(dictionaries),
        warehouseMap: buildWarehouseMap(whList),
        showAmount: this.data.canViewAmount
      });
      this.setData({
        loading: false,
        hero: view.hero,
        summaryStats: view.summaryStats,
        sections: view.sections,
        title: view.hero.docNumberDisplay || '销售单详情'
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});