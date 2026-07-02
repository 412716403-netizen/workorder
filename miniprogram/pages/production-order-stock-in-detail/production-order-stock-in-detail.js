const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  fetchWarehousesAll,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchTenantConfig,
  createProductionRecord,
  updateProductionRecord,
  deleteProductionRecord,
} = require('../../utils/orderApi.js');
const { fetchDictionaries } = require('../../utils/planApi.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');
const { buildStockInFlowDetailView } = require('../../utils/stockInFlow.js');
const {
  initStockInEditMatrixState,
  buildStockInEditMatrixLayout,
  validateStockInEditSave,
  buildStockInEditSaveOperations,
} = require('../../utils/stockInDetailEdit.js');
const {
  applyMatrixKeyPress,
  buildMatrixKeyboardPreview,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function emptyMatrixKeyboardState() {
  return {
    matrixKeyboardVisible: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
  };
}

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
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
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    saving: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 400,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    const perms = (ctx && ctx.permissions) || [];
    this._docNo = options.docNo ? decodeURIComponent(options.docNo) : '';
    const detail = (getApp().globalData && getApp().globalData.stockInFlowDetail) || null;
    this._rows = (detail && detail.rows) || [];
    this._canEdit = hasPermission(perms, 'production:orders_pending_stock_in:edit');
    this._canDelete = hasPermission(perms, 'production:orders_pending_stock_in:delete');

    this.setData({
      docNo: this._docNo,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canEdit: this._canEdit,
      canDelete: this._canDelete,
      showFooter: this._canEdit || this._canDelete,
      scrollHeight: computeScrollHeight(nav, this._canEdit || this._canDelete),
    });

    if (!this._rows.length) {
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
    try {
      const [
        config,
        productsRaw,
        categoriesRaw,
        dictionariesRaw,
        warehousesRaw,
      ] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll(),
      ]);

      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const categoryMap = new Map(categories.map((c) => [c.id, c]));
      const warehouses = Array.isArray(warehousesRaw)
        ? warehousesRaw
        : (warehousesRaw.data || []);
      const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

      const detail = buildStockInFlowDetailView(this._rows, {
        productMap,
        categoryMap,
        warehouseMap,
        dictionaries: dictionariesRaw,
        productionLinkMode,
      });

      if (!detail) {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      const first = this._rows[0];
      const whId = first.warehouseId || detail.warehouseId || '';
      const wh = warehouseMap.get(whId);
      const editWarehouseName = detail.warehouseName
        || (wh && (wh.name || wh.code))
        || '';

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
        warehousePickerIndex: Math.max(0, warehouses.findIndex((w) => w.id === whId)),
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
      this._quantities,
    );
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
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
        this._quantities,
      );
    } else {
      this._quantities = {};
      this._variantRecordMap = {};
    }

    this.setData({
      editing: true,
      editMatrixLayout,
      ...emptyMatrixKeyboardState(),
    });
  },

  onCancelEdit() {
    const detail = this.data.detail;
    const first = (this._rows && this._rows[0]) || {};
    const wh = (this._warehouses || []).find((w) => w.id === (first.warehouseId || detail.warehouseId));
    this._quantities = {};
    this._variantRecordMap = {};
    this.setData({
      editing: false,
      editMatrixLayout: null,
      editQty: detail ? String(detail.totalQty) : '',
      editWarehouseId: first.warehouseId || (detail && detail.warehouseId) || '',
      editWarehouseName: (detail && detail.warehouseName) || (wh && (wh.name || wh.code)) || '',
      warehousePickerIndex: Math.max(0, (this._warehouses || []).findIndex(
        (w) => w.id === (first.warehouseId || (detail && detail.warehouseId)),
      )),
      ...emptyMatrixKeyboardState(),
    });
  },

  onMatrixCellTap(e) {
    const { variantId } = e.currentTarget.dataset;
    if (!variantId) return;
    const preview = buildMatrixKeyboardPreview(
      this.data.editMatrixLayout,
      variantId,
      this._quantities,
    );
    this.setData({
      matrixKeyboardVisible: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    });
  },

  onMatrixKeyboardAction(e) {
    const { action, digit } = e.detail || {};
    if (action === 'confirm') {
      this.setData(emptyMatrixKeyboardState());
      return;
    }
    const { activeMatrixVariantId, editMatrixLayout } = this.data;
    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(editMatrixLayout, activeMatrixVariantId);
      if (nextId) {
        const preview = buildMatrixKeyboardPreview(editMatrixLayout, nextId, this._quantities);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        });
      } else {
        this.setData(emptyMatrixKeyboardState());
      }
      return;
    }
    if (action === 'next') {
      const nextId = getNextMatrixVariantIdInColumn(editMatrixLayout, activeMatrixVariantId);
      if (nextId) {
        const preview = buildMatrixKeyboardPreview(editMatrixLayout, nextId, this._quantities);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        });
      } else {
        this.setData(emptyMatrixKeyboardState());
      }
      return;
    }
    if (!activeMatrixVariantId) return;
    const current = this._quantities[activeMatrixVariantId] || '';
    this._quantities[activeMatrixVariantId] = applyMatrixKeyPress(current, action, digit);
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
      editWarehouseName: wh.name || wh.code || '',
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
      warehouseId: this.data.editWarehouseId,
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
      collabData: first.collabData,
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
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
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
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 400);
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
});
