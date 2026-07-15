const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =








  require('../../utils/orderApi.js'),fetchWarehousesAll = _require3.fetchWarehousesAll,fetchProductsAll = _require3.fetchProductsAll,fetchCategoriesAll = _require3.fetchCategoriesAll,fetchTenantConfig = _require3.fetchTenantConfig,fetchProductionRecords = _require3.fetchProductionRecords,createProductionRecord = _require3.createProductionRecord,updateProductionRecord = _require3.updateProductionRecord,deleteProductionRecord = _require3.deleteProductionRecord;
const _require4 = require('../../utils/planApi.js'),fetchDictionaries = _require4.fetchDictionaries;
const _require5 = require('../../utils/productionPlans.js'),normalizeMasterList = _require5.normalizeMasterList;
const _require6 = require('../utils/stockInFlow.js'),buildStockInFlowDetailView = _require6.buildStockInFlowDetailView,normalizeStockInRecord = _require6.normalizeStockInRecord;
const _require7 =




  require('../utils/stockInDetailEdit.js'),initStockInEditMatrixState = _require7.initStockInEditMatrixState,buildStockInEditMatrixLayout = _require7.buildStockInEditMatrixLayout,validateStockInEditSave = _require7.validateStockInEditSave,buildStockInEditSaveOperations = _require7.buildStockInEditSaveOperations;
const _require8 =






  require('../../utils/matrixQtyKeyboard.js'),activateMatrixKeyboardCell = _require8.activateMatrixKeyboardCell,applyMatrixKeyboardKey = _require8.applyMatrixKeyboardKey,buildMatrixKeyboardPreview = _require8.buildMatrixKeyboardPreview,createMatrixKeyboardInputSession = _require8.createMatrixKeyboardInputSession,getNextMatrixVariantIdInColumn = _require8.getNextMatrixVariantIdInColumn,getNextMatrixVariantIdInRow = _require8.getNextMatrixVariantIdInRow;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics,computePlanCreateHeaderHeight = _require9.computePlanCreateHeaderHeight;
const _require0 = require('../../utils/matrixKeyboardLayout.js'),afterMatrixKeyboardOpen = _require0.afterMatrixKeyboardOpen;
const _require1 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require1.LIST_ROUTES,afterSaveReturnToList = _require1.afterSaveReturnToList;

function computeHeaderBlockHeight(nav) {
  return computePlanCreateHeaderHeight(nav);
}

function emptyMatrixKeyboardState() {
  return {
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: ''
  };
}

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = hasFooter ? Math.ceil(120 * rpx) + (win.safeAreaBottom || 0) : 0;
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, win.windowHeight - headerPx - footerPx);
}

Page({
  data: {
    loading: true,
    detail: null,
    docNo: '',
    canEdit: false,
    canEditQty: false,
    canDelete: false,
    editing: false,
    showFooter: false,
    editQty: '',
    warehouseNames: [],
    warehousePickerIndex: 0,
    editWarehouseId: '',
    editWarehouseName: '',
    editMatrixLayout: null,
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    matrixScrollTop: 0,
    saving: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 400
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    const perms = ctx && ctx.permissions || [];
    this._docNo = options.docNo ? decodeURIComponent(options.docNo) : '';
    this._productId = options.productId ? decodeURIComponent(options.productId) : '';
    const app = getApp();
    const cached = app.globalData && app.globalData.stockInFlowDetail || null;
    if (cached && cached.docNo === this._docNo && Array.isArray(cached.rows) && cached.rows.length) {
      this._rows = cached.rows;
    } else {
      this._rows = [];
    }
    if (app.globalData) app.globalData.stockInFlowDetail = null;
    this._canEdit = hasPermission(perms, 'production:orders_pending_stock_in:edit');
    this._canDelete = hasPermission(perms, 'production:orders_pending_stock_in:delete');
    this._matrixKbInput = createMatrixKeyboardInputSession();

    this.setData({
      docNo: this._docNo,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canEdit: this._canEdit,
      canDelete: this._canDelete,
      showFooter: this._canEdit || this._canDelete,
      scrollHeight: computeScrollHeight(nav, this._canEdit || this._canDelete)
    });

    if (!this._docNo && !this._rows.length) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
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

  onProductImageError() {
    this.setData({ 'detail.showProductImage': false });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const needsFetch = !this._rows.length;
      const _await$Promise$all =






        await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll(),
        needsFetch ?
        fetchProductionRecords({
          docNo: this._docNo,
          type: 'STOCK_IN',
          ...(this._productId ? { productId: this._productId } : {})
        }).catch(() => []) :
        Promise.resolve(null)]
        ),config = _await$Promise$all[0],productsRaw = _await$Promise$all[1],categoriesRaw = _await$Promise$all[2],dictionariesRaw = _await$Promise$all[3],warehousesRaw = _await$Promise$all[4],recordsRaw = _await$Promise$all[5];

      if (needsFetch) {
        const rows = Array.isArray(recordsRaw) ? recordsRaw : recordsRaw && recordsRaw.data || [];
        this._rows = rows.map(normalizeStockInRecord);
      }

      const productionLinkMode = config && config.productionLinkMode || 'order';
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const categoryMap = new Map(categories.map((c) => [c.id, c]));
      const warehouses = Array.isArray(warehousesRaw) ?
      warehousesRaw :
      warehousesRaw.data || [];
      const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

      const detail = buildStockInFlowDetailView(this._rows, {
        productMap,
        categoryMap,
        warehouseMap,
        dictionaries: dictionariesRaw,
        productionLinkMode
      });

      if (!detail) {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      const first = this._rows[0];
      const whId = first.warehouseId || detail.warehouseId || '';
      const wh = warehouseMap.get(whId);
      const editWarehouseName = detail.warehouseName ||
      wh && (wh.name || wh.code) ||
      '';

      this._warehouses = warehouses;
      this._product = first.productId ? productMap.get(first.productId) : null;
      this._dictionaries = dictionariesRaw;
      this.setData({
        loading: false,
        detail,
        docNo: detail.docNo,
        canEditQty: detail.allowQtyEdit,
        editQty: String(detail.totalQty),
        warehouseNames: warehouses.map((w) => w.name || w.code || w.id),
        editWarehouseId: whId,
        editWarehouseName,
        warehousePickerIndex: Math.max(0, warehouses.findIndex((w) => w.id === whId))
      });
    } catch {
      this.setData({ loading: false, detail: null });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  buildEditMatrixLayout() {
    if (!this._product) return null;
    return buildStockInEditMatrixLayout(this._product, this._dictionaries, this._quantities);
  },

  rebuildEditMatrixLayout() {
    this.setData({ editMatrixLayout: this.buildEditMatrixLayout() });
    this.syncMatrixKeyboardPreview();
  },

  syncMatrixKeyboardPreview(variantId) {
    const id = variantId !== undefined ? variantId : this.data.activeMatrixVariantId;
    const preview = buildMatrixKeyboardPreview(
      this.data.editMatrixLayout,
      id,
      this._quantities
    );
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    });
  },

  onEnterEdit() {
    if (!this.data.canEdit) return;
    const detail = this.data.detail;
    let editMatrixLayout = null;

    if (detail && detail.showMatrix && this._product) {
      const init = initStockInEditMatrixState(this._rows, this._product);
      this._quantities = init.quantities;
      this._variantRecordMap = init.variantRecordMap;
      editMatrixLayout = buildStockInEditMatrixLayout(
        this._product,
        this._dictionaries,
        this._quantities
      );
    } else {
      this._quantities = {};
      this._variantRecordMap = {};
    }

    this.setData({
      editing: true,
      editMatrixLayout,
      ...emptyMatrixKeyboardState()
    });
  },

  onCancelEdit() {
    const detail = this.data.detail;
    const first = this._rows && this._rows[0] || {};
    const wh = (this._warehouses || []).find((w) => w.id === (first.warehouseId || detail.warehouseId));
    this._quantities = {};
    this._variantRecordMap = {};
    this.setData({
      editing: false,
      editMatrixLayout: null,
      editQty: detail ? String(detail.totalQty) : '',
      editWarehouseId: first.warehouseId || detail && detail.warehouseId || '',
      editWarehouseName: detail && detail.warehouseName || wh && (wh.name || wh.code) || '',
      warehousePickerIndex: Math.max(0, (this._warehouses || []).findIndex(
        (w) => w.id === (first.warehouseId || detail && detail.warehouseId)
      )),
      ...emptyMatrixKeyboardState()
    });
  },

  onMatrixCellTap(e) {
    const variantId = e.currentTarget.dataset.variantId;
    if (!variantId) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      this.data.editMatrixLayout,
      variantId,
      this._quantities
    );
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    }, () => {
      afterMatrixKeyboardOpen(this, '.plan-detail-scroll');
    });
  },

  onMatrixKeyboardAction(e) {
    const _ref = e.detail || {},action = _ref.action,digit = _ref.digit;
    if (action === 'confirm') {
      this.setData(emptyMatrixKeyboardState());
      return;
    }
    const _this$data = this.data,activeMatrixVariantId = _this$data.activeMatrixVariantId,editMatrixLayout = _this$data.editMatrixLayout;
    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(editMatrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(editMatrixLayout, nextId, this._quantities);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value
        }, () => {
          afterMatrixKeyboardOpen(this, '.plan-detail-scroll');
        });
      } else {
        this.setData(emptyMatrixKeyboardState());
      }
      return;
    }
    if (action === 'next') {
      const nextId = getNextMatrixVariantIdInColumn(editMatrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(editMatrixLayout, nextId, this._quantities);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value
        }, () => {
          afterMatrixKeyboardOpen(this, '.plan-detail-scroll');
        });
      } else {
        this.setData(emptyMatrixKeyboardState());
      }
      return;
    }
    if (!activeMatrixVariantId) return;
    const current = this._quantities[activeMatrixVariantId] || '';
    const _applyMatrixKeyboardK = applyMatrixKeyboardKey(this._matrixKbInput, current, action, digit),value = _applyMatrixKeyboardK.value,replaceConsumed = _applyMatrixKeyboardK.replaceConsumed;
    this._quantities[activeMatrixVariantId] = value;
    if (replaceConsumed) {
      this.setData({ matrixInputReplaceAll: false });
    }
    this.rebuildEditMatrixLayout();
  },

  onEditQtyInput(e) {
    this.setData({ editQty: e.detail.value || '' });
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

  async executeSaveOp(op) {
    if (op.type === 'update') {
      await updateProductionRecord(op.id, op.body);
      return;
    }
    if (op.type === 'delete') {
      await deleteProductionRecord(op.id);
      return;
    }
    if (op.type === 'create') {
      await createProductionRecord(op.body);
    }
  },

  async onSave() {
    if (!this.data.canEdit || !this._rows.length || this.data.saving) return;
    const detail = this.data.detail;
    const first = this._rows[0];
    const useMatrix = Boolean(detail && detail.showMatrix && this.data.editMatrixLayout);

    const errMsg = validateStockInEditSave({
      useMatrix,
      quantities: this._quantities,
      matrixLayout: this.data.editMatrixLayout,
      singleQty: this.data.editQty,
      warehouseId: this.data.editWarehouseId
    });
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' });
      return;
    }

    const ops = buildStockInEditSaveOperations({
      rows: this._rows,
      quantities: this._quantities,
      variantRecordMap: this._variantRecordMap,
      matrixLayout: this.data.editMatrixLayout,
      useMatrix,
      warehouseId: this.data.editWarehouseId,
      docNo: detail.docNo || first.docNo,
      operator: first.operator,
      timestamp: first.timestamp,
      singleQty: this.data.editQty,
      collabData: first.collabData
    });

    if (!ops.length) {
      wx.showToast({ title: '请填写入库数量', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      for (let i = 0; i < ops.length; i += 1) {
        await this.executeSaveOp(ops[i]);
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.STOCK_IN_HISTORY,
        toastTitle: '已保存'
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: err && err.message || '保存失败', icon: 'none' });
    }
  },

  onDelete() {
    if (!this.data.canDelete) return;
    wx.showModal({
      title: '删除入库单',
      content: '确定删除该入库流水？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中' });
        try {
          for (let i = 0; i < this._rows.length; i += 1) {
            await deleteProductionRecord(this._rows[i].id);
          }
          wx.hideLoading();
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.STOCK_IN_HISTORY,
            toastTitle: '已删除'
          });
        } catch (err) {
          wx.showToast({ title: err && err.message || '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  }
});