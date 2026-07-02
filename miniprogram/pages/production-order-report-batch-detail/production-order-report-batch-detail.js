const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  listReportHistory,
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchNodesAll,
  updateOrderReport,
  deleteOrderReport,
  updateProductReport,
  deleteProductReport,
  createOrderReport,
  createProductReport,
} = require('../../utils/orderApi.js');
const { fetchDictionaries } = require('../../utils/planApi.js');
const { normalizeMasterList, normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const {
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
} = require('../../utils/orderReportHistory.js');
const {
  buildReportBatches,
  findBatchByKey,
  buildBatchDetailView,
  editPartsToTimestamp,
} = require('../../utils/reportBatchDetail.js');
const {
  initBatchEditQuantities,
  buildBatchSaveOperations,
} = require('../../utils/reportBatchEdit.js');
const { buildReportMatrixLayout } = require('../../utils/orderReportForm.js');
const {
  applyMatrixKeyPress,
  buildMatrixKeyboardPreview,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

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
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function emptyMatrixKeyboardState() {
  return {
    matrixKeyboardVisible: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
  };
}

Page({
  data: {
    loading: true,
    editing: false,
    saving: false,
    detail: null,
    canEdit: false,
    canDelete: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    showFooter: false,
    editMatrixLayout: null,
    qtyInputMode: 'good',
    matrixKeyboardVisible: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
  },

  _quantities: {},
  _defectiveQuantities: {},
  _variantReportMap: {},

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._batchKey = options.batchKey ? decodeURIComponent(options.batchKey) : '';
    this._dateFrom = options.dateFrom ? decodeURIComponent(options.dateFrom) : '';
    this._dateTo = options.dateTo ? decodeURIComponent(options.dateTo) : '';
    this._orderId = options.orderId ? decodeURIComponent(options.orderId) : '';

    const ctx = readTenantCtx() || {};
    const perms = ctx.permissions || [];
    this._canEdit = hasPermission(perms, 'production:orders_report_records:edit');
    this._canDelete = hasPermission(perms, 'production:orders_report_records:delete');

    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canEdit: this._canEdit,
      canDelete: this._canDelete,
    });
    this.loadDetail();
  },

  onPullDownRefresh() {
    this.loadDetail().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    if (this.data.editing) {
      this.exitEditMode();
      return;
    }
    wx.navigateBack();
  },

  exitEditMode() {
    this._quantities = {};
    this._defectiveQuantities = {};
    this._variantReportMap = {};
    this._editProduct = null;
    this.setData({
      editing: false,
      editMatrixLayout: null,
      qtyInputMode: 'good',
      ...emptyMatrixKeyboardState(),
    });
    this.refreshViewModel();
  },

  refreshViewModel() {
    if (!this._batch) return;
    const detail = buildBatchDetailView(this._batch, {
      products: this._products,
      categories: this._categories,
      dictionaries: this._dictionaries,
      nodes: this._nodes,
      productMap: this._productMap,
      categoryMap: this._categoryMap,
      showAmount: true,
    });
    const showFooter = !detail.isOutsourceReceive && (this._canEdit || this._canDelete) && !this.data.editing;
    this.setData({
      detail,
      showFooter,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), showFooter || this.data.editing),
    });
  },

  async loadDetail() {
    if (!this._batchKey) {
      this.setData({ loading: false, detail: null });
      return;
    }
    this.setData({ loading: true });
    try {
      const [config, productsRaw, categoriesRaw, nodesRaw, dictionariesRaw] = await Promise.all([
        fetchTenantConfig(),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchNodesAll().catch(() => []),
        fetchDictionaries().catch(() => []),
      ]);
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const params = {
        startDate: dateInputToIsoStart(this._dateFrom),
        endDate: dateInputToIsoEndExclusive(this._dateTo),
        productionLinkMode,
      };
      if (this._orderId) params.orderIds = this._orderId;

      const res = await listReportHistory(params);
      const batches = buildReportBatches(
        (res && res.orderReports) || [],
        (res && res.productReports) || [],
        productionLinkMode,
      );
      this._batch = findBatchByKey(batches, this._batchKey);
      this._products = normalizeMasterList(productsRaw);
      this._categories = normalizeMasterList(categoriesRaw);
      this._nodes = normalizeMasterList(nodesRaw);
      this._dictionaries = normalizeAppDictionaries(dictionariesRaw);
      this._productMap = new Map(this._products.map((p) => [p.id, p]));
      this._categoryMap = new Map(this._categories.map((c) => [c.id, c]));
      this._productionLinkMode = productionLinkMode;

      if (!this._batch) {
        this.setData({ loading: false, detail: null, showFooter: false });
        return;
      }

      this.setData({ loading: false, editing: false });
      this.refreshViewModel();
    } catch (err) {
      this.setData({ loading: false, detail: null, showFooter: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },

  buildEditMatrixLayout() {
    if (!this._editProduct) return null;
    return buildReportMatrixLayout(
      this._editProduct,
      this._dictionaries,
      this._quantities,
      this._defectiveQuantities,
    );
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
      this.getActiveMatrixQtyMap(),
    );
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    });
  },

  getActiveMatrixQtyMap() {
    return this.data.qtyInputMode === 'defective' ? this._defectiveQuantities : this._quantities;
  },

  setActiveMatrixQty(variantId, value) {
    if (this.data.qtyInputMode === 'defective') {
      this._defectiveQuantities[variantId] = value;
    } else {
      this._quantities[variantId] = value;
    }
  },

  onEnterEdit() {
    if (!this._canEdit || !this.data.detail || this.data.detail.isOutsourceReceive) {
      if (this.data.detail && this.data.detail.isOutsourceReceive) {
        wx.showToast({ title: '外协收回请在电脑端编辑', icon: 'none' });
      }
      return;
    }

    const detail = buildBatchDetailView(this._batch, {
      products: this._products,
      categories: this._categories,
      dictionaries: this._dictionaries,
      nodes: this._nodes,
      productMap: this._productMap,
      categoryMap: this._categoryMap,
      showAmount: true,
    });
    detail.editRate = detail.batchUnitRate > 0 ? String(detail.batchUnitRate) : '';

    const first = this._batch.first;
    this._editProduct = this._productMap.get(first.productId) || null;

    let editMatrixLayout = null;
    if (detail.showMatrix && this._editProduct) {
      const init = initBatchEditQuantities(this._batch);
      this._quantities = init.quantities;
      this._defectiveQuantities = init.defectiveQuantities;
      this._variantReportMap = init.variantReportMap;
      editMatrixLayout = buildReportMatrixLayout(
        this._editProduct,
        this._dictionaries,
        this._quantities,
        this._defectiveQuantities,
      );
    } else {
      this._quantities = {};
      this._defectiveQuantities = {};
      this._variantReportMap = {};
    }

    this.setData({
      editing: true,
      detail,
      editMatrixLayout,
      showFooter: true,
      qtyInputMode: 'good',
      ...emptyMatrixKeyboardState(),
      scrollHeight: computeScrollHeight(readNavBarMetrics(), true),
    });
  },

  onEditDateChange(e) {
    this.setData({ 'detail.editDate': e.detail.value || '' });
  },

  onEditTimeChange(e) {
    this.setData({ 'detail.editTime': e.detail.value || '' });
  },

  onEditOperatorInput(e) {
    this.setData({ 'detail.editOperator': e.detail.value || '' });
  },

  onEditRateInput(e) {
    this.setData({ 'detail.editRate': e.detail.value || '' });
  },

  onLineGoodInput(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`detail.lineItems[${index}].editGoodQty`]: e.detail.value || '' });
  },

  onLineDefectiveInput(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`detail.lineItems[${index}].editDefectiveQty`]: e.detail.value || '' });
  },

  onQtyModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'good' && mode !== 'defective') return;
    if (mode === this.data.qtyInputMode) return;
    this.setData({
      qtyInputMode: mode,
      ...emptyMatrixKeyboardState(),
    });
  },

  onMatrixCellTap(e) {
    const { variantId } = e.currentTarget.dataset;
    if (!variantId) return;
    const preview = buildMatrixKeyboardPreview(
      this.data.editMatrixLayout,
      variantId,
      this.getActiveMatrixQtyMap(),
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
    const qtyMap = this.getActiveMatrixQtyMap();
    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(editMatrixLayout, activeMatrixVariantId);
      if (nextId) {
        const preview = buildMatrixKeyboardPreview(editMatrixLayout, nextId, qtyMap);
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
        const preview = buildMatrixKeyboardPreview(editMatrixLayout, nextId, qtyMap);
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
    const current = qtyMap[activeMatrixVariantId] || '';
    this.setActiveMatrixQty(activeMatrixVariantId, applyMatrixKeyPress(current, action, digit));
    this.rebuildEditMatrixLayout();
  },

  onCancelEdit() {
    this.exitEditMode();
  },

  async executeSaveOp(op) {
    if (op.type === 'update') {
      if (op.source === 'product') {
        await updateProductReport(op.reportId, op.body);
      } else {
        await updateOrderReport(op.orderId, op.milestoneId, op.reportId, op.body);
      }
      return;
    }
    if (op.type === 'delete') {
      if (op.source === 'product') {
        await deleteProductReport(op.reportId);
      } else {
        await deleteOrderReport(op.orderId, op.milestoneId, op.reportId);
      }
      return;
    }
    if (op.type === 'create') {
      if (op.source === 'product') {
        await createProductReport(op.body);
      } else {
        await createOrderReport(op.orderId, op.milestoneId, op.body);
      }
    }
  },

  async onSaveEdit() {
    if (!this._batch || this.data.saving) return;
    const detail = this.data.detail;
    if (!detail) return;

    const timestamp = editPartsToTimestamp(detail.editDate, detail.editTime);
    const operator = (detail.editOperator || '').trim();
    const useMatrix = Boolean(detail.showMatrix && this.data.editMatrixLayout);

    const ops = buildBatchSaveOperations({
      batch: this._batch,
      detail,
      quantities: this._quantities,
      defectiveQuantities: this._defectiveQuantities,
      variantReportMap: this._variantReportMap,
      matrixLayout: this.data.editMatrixLayout,
      useMatrix,
      timestamp,
      operator,
    });

    if (!ops.length) {
      wx.showToast({ title: '请填写报工数量', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      for (let i = 0; i < ops.length; i += 1) {
        await this.executeSaveOp(ops[i]);
      }
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      this._quantities = {};
      this._defectiveQuantities = {};
      this._variantReportMap = {};
      this._editProduct = null;
      this.setData({
        saving: false,
        editing: false,
        editMatrixLayout: null,
        qtyInputMode: 'good',
        ...emptyMatrixKeyboardState(),
      });
      await this.loadDetail();
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    }
  },

  onDeleteTap() {
    if (!this._canDelete || !this._batch || this.data.detail.isOutsourceReceive) {
      if (this.data.detail && this.data.detail.isOutsourceReceive) {
        wx.showToast({ title: '外协收回请在电脑端删除', icon: 'none' });
      }
      return;
    }
    wx.showModal({
      title: '删除报工',
      content: '确定要删除该次报工的所有记录吗？此操作不可恢复。',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) this.deleteBatch();
      },
    });
  },

  async deleteBatch() {
    if (!this._batch) return;
    wx.showLoading({ title: '删除中…', mask: true });
    try {
      for (const row of this._batch.rows) {
        const r = row.raw;
        if (row.source === 'product') {
          await deleteProductReport(r.reportId);
        } else {
          await deleteOrderReport(r.orderId, r.milestoneId, r.reportId);
        }
      }
      wx.hideLoading();
      wx.showToast({ title: '已删除', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  },

  onProductImageError() {
    this.setData({ 'detail.showProductImage': false });
  },
});
