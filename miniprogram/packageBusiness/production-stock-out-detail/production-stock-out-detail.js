const _require = require('../utils/planApi.js'),fetchDictionaries = _require.fetchDictionaries,fetchCategoriesAll = _require.fetchCategoriesAll;
const _require2 = require('../../utils/session.js'),readTenantCtx = _require2.readTenantCtx;
const _require3 = require('../../utils/permissions.js'),hasPermission = _require3.hasPermission;
const _require4 =






  require('../utils/orderApi.js'),fetchProductsAll = _require4.fetchProductsAll,fetchTenantConfig = _require4.fetchTenantConfig,fetchWarehousesAll = _require4.fetchWarehousesAll,fetchProductionRecords = _require4.fetchProductionRecords,updateProductionRecord = _require4.updateProductionRecord,deleteProductionRecord = _require4.deleteProductionRecord;
const _require5 = require('../utils/productionPlans.js'),normalizeMasterList = _require5.normalizeMasterList;
const _require6 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require6.fetchAllOrdersPaginated;
const _require7 = require('../utils/materialStockFlow.js'),buildMaterialFlowDetailView = _require7.buildMaterialFlowDetailView;
const _require8 =



  require('../utils/materialFlowDetailEdit.js'),initMaterialFlowEditState = _require8.initMaterialFlowEditState,validateMaterialFlowEditSave = _require8.validateMaterialFlowEditSave,buildMaterialFlowEditSaveOperations = _require8.buildMaterialFlowEditSaveOperations;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics,computePlanCreateHeaderHeight = _require9.computePlanCreateHeaderHeight;
const _require0 = require('../utils/saveNavigation.js'),LIST_ROUTES = _require0.LIST_ROUTES,afterSaveReturnToList = _require0.afterSaveReturnToList;

function computeHeaderBlockHeight(nav) {
  return computePlanCreateHeaderHeight(nav);
}

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = hasFooter ? Math.ceil(120 * rpx) + (win.safeAreaBottom || 0) : 0;
  return Math.max(200, win.windowHeight - computeHeaderBlockHeight(nav) - footerPx);
}

Page({
  data: {
    loading: true,
    editing: false,
    saving: false,
    detail: null,
    docNo: '',
    canEdit: false,
    canDelete: false,
    showFooter: false,
    editLineItems: [],
    warehouseNames: [],
    warehousePickerIndex: 0,
    editWarehouseId: '',
    editWarehouseName: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 400
  },

  _rows: [],

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx() || {};
    const perms = ctx.permissions || [];
    if (!hasPermission(perms, 'production:material_records:view')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._docNo = options.docNo ? decodeURIComponent(options.docNo) : '';
    this._canEdit = hasPermission(perms, 'production:material_records:edit');
    this._canDelete = hasPermission(perms, 'production:material_records:delete');
    const showFooter = this._canEdit || this._canDelete;

    this.setData({
      docNo: this._docNo,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canEdit: this._canEdit,
      canDelete: this._canDelete,
      showFooter,
      scrollHeight: computeScrollHeight(nav, showFooter)
    });

    if (!this._docNo) {
      wx.showToast({ title: '缺少单号', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.bootstrap();
  },

  onHeaderBack() {
    if (this.data.editing) {
      this.exitEditMode();
      return;
    }
    wx.navigateBack();
  },

  refreshViewModel(extra) {
    const detail = buildMaterialFlowDetailView(this._rows, {
      productMap: this._productMap,
      warehouseMap: this._warehouseMap,
      orderMap: this._orderMap,
      categoryMap: this._categoryMap,
      productionLinkMode: this._productionLinkMode,
      dictionaries: this._dictionaries
    });
    const showFooter = (this._canEdit || this._canDelete) && !this.data.editing;
    this.setData({
      ...(extra || {}),
      loading: false,
      detail,
      docNo: detail ? detail.docNo : this._docNo,
      showFooter,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), showFooter || this.data.editing)
    });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchAllOrdersPaginated({}).catch(() => []),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchWarehousesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchProductionRecords({
          docNo: this._docNo,
          types: 'STOCK_OUT,STOCK_RETURN'
        }).catch(() => [])]
        ),config = _await$Promise$all[0],orders = _await$Promise$all[1],productsRaw = _await$Promise$all[2],categoriesRaw = _await$Promise$all[3],warehousesRaw = _await$Promise$all[4],dictionariesRaw = _await$Promise$all[5],recordsRaw = _await$Promise$all[6];

      this._productionLinkMode = config && config.productionLinkMode || 'order';
      const products = normalizeMasterList(productsRaw);
      this._productMap = new Map(products.map((p) => [p.id, p]));
      const categories = normalizeMasterList(categoriesRaw);
      this._categoryMap = new Map(categories.map((c) => [c.id, c]));
      this._orderMap = new Map((orders || []).map((o) => [o.id, o]));
      const warehouses = Array.isArray(warehousesRaw) ? warehousesRaw : warehousesRaw.data || [];
      this._warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
      this._dictionaries = dictionariesRaw || {};
      this._warehouses = warehouses;
      this._rows = Array.isArray(recordsRaw) ? recordsRaw : recordsRaw && recordsRaw.data || [];

      if (!this._rows.length) {
        this.setData({ loading: false, detail: null });
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      this.refreshViewModel();
    } catch {
      this.setData({ loading: false, detail: null });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  exitEditMode() {
    const detail = this.data.detail;
    const first = this._rows[0] || {};
    const wh = (this._warehouses || []).find((w) => w.id === (first.warehouseId || detail && detail.warehouseId));
    this.setData({
      editing: false,
      editWarehouseId: first.warehouseId || detail && detail.warehouseId || '',
      editWarehouseName: detail && detail.warehouseName || wh && (wh.name || wh.code) || '',
      warehousePickerIndex: Math.max(0, (this._warehouses || []).findIndex(
        (w) => w.id === (first.warehouseId || detail && detail.warehouseId)
      ))
    });
    this.refreshViewModel();
  },

  onEnterEdit() {
    if (!this._canEdit || !this._rows.length) return;
    const init = initMaterialFlowEditState(this._rows);
    const wh = (this._warehouses || []).find((w) => w.id === init.editWarehouseId);
    this.setData({
      editing: true,
      showFooter: true,
      editLineItems: init.lineItems,
      editWarehouseId: init.editWarehouseId,
      editWarehouseName: wh && (wh.name || wh.code) || '',
      warehouseNames: (this._warehouses || []).map((w) => w.name || w.code || w.id),
      warehousePickerIndex: Math.max(0, (this._warehouses || []).findIndex((w) => w.id === init.editWarehouseId)),
      scrollHeight: computeScrollHeight(readNavBarMetrics(), true)
    });
  },

  onCancelEdit() {
    this.exitEditMode();
  },

  onLineQtyInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`editLineItems[${index}].editQty`]: e.detail.value || '' });
  },

  onWarehouseChange(e) {
    const idx = Number(e.detail.value) || 0;
    const wh = (this._warehouses || [])[idx];
    if (!wh) return;
    this.setData({
      warehousePickerIndex: idx,
      editWarehouseId: wh.id,
      editWarehouseName: wh.name || wh.code || ''
    });
  },

  async onSaveEdit() {
    if (!this._canEdit || !this._rows.length || this.data.saving) return;
    const editState = {
      editWarehouseId: this.data.editWarehouseId,
      lineItems: this.data.editLineItems
    };
    const errMsg = validateMaterialFlowEditSave({
      warehouseId: editState.editWarehouseId,
      lineItems: editState.lineItems
    });
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' });
      return;
    }

    const ops = buildMaterialFlowEditSaveOperations(this._rows, editState);
    if (!ops.length) {
      wx.showToast({ title: '请填写数量', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      for (let i = 0; i < ops.length; i += 1) {
        if (ops[i].type === 'update') {
          await updateProductionRecord(ops[i].id, ops[i].body);
        }
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.STOCK_OUT,
        toastTitle: '已保存'
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: err && err.message || '保存失败', icon: 'none' });
    }
  },

  onDeleteTap() {
    if (!this._canDelete || !this._rows.length) return;
    wx.showModal({
      title: '删除单据',
      content: '确定要删除该张领退料单的所有记录吗？此操作不可恢复。',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) this.deleteDoc();
      }
    });
  },

  async deleteDoc() {
    wx.showLoading({ title: '删除中…', mask: true });
    try {
      for (let i = 0; i < this._rows.length; i += 1) {
        await deleteProductionRecord(this._rows[i].id);
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.STOCK_OUT,
        toastTitle: '已删除'
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err && err.message || '删除失败', icon: 'none' });
    }
  }
});