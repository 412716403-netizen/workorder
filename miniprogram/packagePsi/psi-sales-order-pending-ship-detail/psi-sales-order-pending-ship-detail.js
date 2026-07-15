const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/salesOrders.js'),PSI_TYPE = _require3.PSI_TYPE;
const _require4 =



  require('../utils/salesOrders.js'),buildPendingShipmentGroups = _require4.buildPendingShipmentGroups,buildProductMap = _require4.buildProductMap,buildWarehouseMap = _require4.buildWarehouseMap;
const _require5 =





  require('../utils/salesOrderPendingShip.js'),buildPendingShipDetailViewModel = _require5.buildPendingShipDetailViewModel,collectEditQuantitiesFromLineItems = _require5.collectEditQuantitiesFromLineItems,sumEditQuantities = _require5.sumEditQuantities,buildPendingShipEditSaveRecords = _require5.buildPendingShipEditSaveRecords,buildPendingShipDeleteRecords = _require5.buildPendingShipDeleteRecords;
const _require6 = require('../../utils/psiApi.js'),fetchAllPsiRecords = _require6.fetchAllPsiRecords,replacePsiRecords = _require6.replacePsiRecords;
const _require7 = require('../../utils/planApi.js'),fetchProductsAll = _require7.fetchProductsAll,fetchDictionaries = _require7.fetchDictionaries;
const _require8 = require('../../utils/orderApi.js'),fetchWarehousesAll = _require8.fetchWarehousesAll;
const _require9 = require('../../utils/productionPlans.js'),normalizeAppDictionaries = _require9.normalizeAppDictionaries;
const _require0 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require0.readNavBarMetrics,readWindowMetrics = _require0.readWindowMetrics,computePlanCreateHeaderHeight = _require0.computePlanCreateHeaderHeight;
const _require1 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require1.LIST_ROUTES,afterSaveReturnToList = _require1.afterSaveReturnToList;

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = hasFooter ? Math.ceil(120 * rpx) + (win.safeAreaBottom || 0) : 0;
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function findWarehouseIndex(warehouses, warehouseId) {
  const idx = (warehouses || []).findIndex((w) => w.id === warehouseId);
  return idx >= 0 ? idx : 0;
}

Page({
  data: {
    loading: true,
    editing: false,
    saving: false,
    detail: null,
    lineItems: [],
    totalPendingText: '0',
    warehouseNames: [],
    warehouseIndex: 0,
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
    const ctx = readTenantCtx() || {};
    const perms = ctx.permissions || [];
    if (!hasPermission(perms, 'psi:sales_order_pending_shipment:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    const lineGroupId = options.lineGroupId ? decodeURIComponent(options.lineGroupId) : '';
    const canEdit = hasPermission(perms, 'psi:sales_order_allocation:allow');
    const canDelete = canEdit;
    const showFooter = canEdit || canDelete;
    this._docNumber = docNumber;
    this._lineGroupId = lineGroupId;
    this._canEdit = canEdit;
    this._canDelete = canDelete;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav, showFooter),
      canEdit,
      canDelete,
      showFooter
    });
    if (!docNumber || !lineGroupId) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.bootstrap();
  },

  onHeaderBack() {
    if (this.data.editing) {
      this.onCancelEdit();
      return;
    }
    wx.navigateBack();
  },

  syncViewModel() {
    const group = this._group;
    if (!group) return;
    const detail = buildPendingShipDetailViewModel(group, this._product, this._dictionaries || {});
    this._viewSnapshot = {
      lineItems: detail.lineItems.map((item) => ({ ...item })),
      warehouseId: detail.warehouseId
    };
    this.setData({
      detail,
      lineItems: detail.lineItems,
      totalPendingText: detail.totalPendingText,
      warehouseIndex: findWarehouseIndex(this._warehouses, detail.warehouseId)
    });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => [])]
        ),records = _await$Promise$all[0],products = _await$Promise$all[1],dictionariesRaw = _await$Promise$all[2],warehousesRaw = _await$Promise$all[3];
      const whList = Array.isArray(warehousesRaw) ? warehousesRaw : warehousesRaw.data || [];
      this._allRecords = records || [];
      this._dictionaries = normalizeAppDictionaries(dictionariesRaw || {});
      this._warehouses = whList.filter((w) => w && w.id);
      this._productMap = buildProductMap(products || []);
      const groups = buildPendingShipmentGroups(
        this._allRecords,
        this._productMap,
        buildWarehouseMap(this._warehouses)
      );
      const group = groups.find(
        (g) => g.docNumber === this._docNumber && String(g.lineGroupId) === String(this._lineGroupId)
      );
      if (!group) {
        this.setData({ loading: false, detail: null });
        wx.showToast({ title: '配货项不存在或已发走', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this._group = group;
      this._product = group.productId ? this._productMap.get(group.productId) : null;
      this.setData({
        loading: false,
        warehouseNames: this._warehouses.map((w) => w.name || w.id)
      });
      this.syncViewModel();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onEnterEdit() {
    if (!this._canEdit || !this._viewSnapshot) return;
    this.setData({ editing: true });
  },

  onCancelEdit() {
    const snap = this._viewSnapshot;
    if (!snap) {
      this.setData({ editing: false });
      return;
    }
    this.setData({
      editing: false,
      lineItems: snap.lineItems.map((item) => ({ ...item })),
      totalPendingText: String(snap.lineItems.reduce((s, item) => s + (Number(item.editQty) || 0), 0)),
      warehouseIndex: findWarehouseIndex(this._warehouses, snap.warehouseId)
    });
  },

  onWarehouseChange(e) {
    const index = Number(e.detail.value) || 0;
    this.setData({ warehouseIndex: index });
  },

  onLineQtyInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const lineItems = (this.data.lineItems || []).map((item) =>
    item.id === id ? { ...item, editQty: value } : item
    );
    const total = lineItems.reduce((s, item) => s + (Number(item.editQty) || 0), 0);
    this.setData({ lineItems, totalPendingText: String(total) });
  },

  async onSaveEdit() {
    if (this.data.saving || !this._group) return;
    const warehouse = this._warehouses[this.data.warehouseIndex];
    const warehouseId = warehouse && warehouse.id;
    if (!warehouseId) {
      wx.showToast({ title: '请选择仓库', icon: 'none' });
      return;
    }
    const editQuantities = collectEditQuantitiesFromLineItems(
      this.data.lineItems,
      this.data.detail && this.data.detail.hasVariants
    );
    const total = sumEditQuantities(editQuantities, this.data.detail && this.data.detail.hasVariants);
    if (total <= 0) {
      wx.showToast({ title: '待发数量须大于 0', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中…' });
    try {
      const docRecords = (this._allRecords || []).filter(
        (r) => r.type === PSI_TYPE && r.docNumber === this._docNumber
      );
      const newRecords = buildPendingShipEditSaveRecords(
        docRecords,
        this._group,
        editQuantities,
        warehouseId
      );
      const deleteIds = docRecords.map((r) => r.id);
      await replacePsiRecords(deleteIds, newRecords);
      wx.hideLoading();
      this.setData({ saving: false });
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.PSI_SALES_ORDER_PENDING_SHIP,
        alsoRefreshListUrls: [LIST_ROUTES.PSI_SALES_ORDERS],
        toastTitle: '已保存'
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onDeleteTap() {
    if (!this._canDelete || !this._group) return;
    wx.showModal({
      title: '取消配货',
      content: '确定要取消该组配货吗？已配数量将清零。',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) this.doDelete();
      }
    });
  },

  async doDelete() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '删除中…' });
    try {
      const docRecords = (this._allRecords || []).filter(
        (r) => r.type === PSI_TYPE && r.docNumber === this._docNumber
      );
      const newRecords = buildPendingShipDeleteRecords(docRecords, this._group);
      const deleteIds = docRecords.map((r) => r.id);
      await replacePsiRecords(deleteIds, newRecords);
      wx.hideLoading();
      this.setData({ saving: false });
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.PSI_SALES_ORDER_PENDING_SHIP,
        alsoRefreshListUrls: [LIST_ROUTES.PSI_SALES_ORDERS],
        toastTitle: '已取消配货'
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  }
});