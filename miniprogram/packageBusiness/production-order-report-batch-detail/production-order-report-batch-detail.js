const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =











  require('../utils/orderApi.js'),listReportHistory = _require3.listReportHistory,fetchTenantConfig = _require3.fetchTenantConfig,fetchProductsAll = _require3.fetchProductsAll,fetchCategoriesAll = _require3.fetchCategoriesAll,fetchNodesAll = _require3.fetchNodesAll,updateOrderReport = _require3.updateOrderReport,deleteOrderReport = _require3.deleteOrderReport,updateProductReport = _require3.updateProductReport,deleteProductReport = _require3.deleteProductReport,createOrderReport = _require3.createOrderReport,createProductReport = _require3.createProductReport;
const _require4 = require('../utils/planApi.js'),fetchDictionaries = _require4.fetchDictionaries;
const _require5 = require('../utils/productionPlans.js'),normalizeMasterList = _require5.normalizeMasterList,normalizeAppDictionaries = _require5.normalizeAppDictionaries;
const _require6 =


  require('../utils/orderReportHistory.js'),dateInputToIsoStart = _require6.dateInputToIsoStart,dateInputToIsoEndExclusive = _require6.dateInputToIsoEndExclusive;
const _require7 =




  require('../utils/reportBatchDetail.js'),buildReportBatches = _require7.buildReportBatches,findBatchByKey = _require7.findBatchByKey,buildBatchDetailView = _require7.buildBatchDetailView,editPartsToTimestamp = _require7.editPartsToTimestamp;
const _require8 =


  require('../utils/reportBatchEdit.js'),initBatchEditQuantities = _require8.initBatchEditQuantities,buildBatchSaveOperations = _require8.buildBatchSaveOperations;
const _require9 = require('../utils/orderReportForm.js'),buildReportMatrixLayout = _require9.buildReportMatrixLayout;
const _require0 =






  require('../utils/matrixQtyKeyboard.js'),activateMatrixKeyboardCell = _require0.activateMatrixKeyboardCell,applyMatrixKeyboardKey = _require0.applyMatrixKeyboardKey,buildMatrixKeyboardPreview = _require0.buildMatrixKeyboardPreview,createMatrixKeyboardInputSession = _require0.createMatrixKeyboardInputSession,getNextMatrixVariantIdInColumn = _require0.getNextMatrixVariantIdInColumn,getNextMatrixVariantIdInRow = _require0.getNextMatrixVariantIdInRow;
const _require1 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require1.readNavBarMetrics,readWindowMetrics = _require1.readWindowMetrics,computePlanCreateHeaderHeight = _require1.computePlanCreateHeaderHeight;
const _require10 = require('../utils/matrixKeyboardLayout.js'),afterMatrixKeyboardOpen = _require10.afterMatrixKeyboardOpen;
const _require11 = require('../utils/saveNavigation.js'),LIST_ROUTES = _require11.LIST_ROUTES,buildReportHistoryListUrl = _require11.buildReportHistoryListUrl,afterSaveReturnToList = _require11.afterSaveReturnToList;

function computeHeaderBlockHeight(nav) {
  return computePlanCreateHeaderHeight(nav);
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
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: ''
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
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    matrixScrollTop: 0
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
    this._matrixKbInput = createMatrixKeyboardInputSession();

    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canEdit: this._canEdit,
      canDelete: this._canDelete
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

  reportHistoryListUrl() {
    return buildReportHistoryListUrl({
      dateFrom: this._dateFrom,
      dateTo: this._dateTo,
      orderId: this._orderId
    });
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
      ...emptyMatrixKeyboardState()
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
      showAmount: true
    });
    const showFooter = !detail.isOutsourceReceive && (this._canEdit || this._canDelete) && !this.data.editing;
    this.setData({
      detail,
      showFooter,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), showFooter || this.data.editing)
    });
  },

  async loadDetail() {
    if (!this._batchKey) {
      this.setData({ loading: false, detail: null });
      return;
    }
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchTenantConfig(),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchNodesAll().catch(() => []),
        fetchDictionaries().catch(() => [])]
        ),config = _await$Promise$all[0],productsRaw = _await$Promise$all[1],categoriesRaw = _await$Promise$all[2],nodesRaw = _await$Promise$all[3],dictionariesRaw = _await$Promise$all[4];
      const productionLinkMode = config && config.productionLinkMode || 'order';
      const params = {
        startDate: dateInputToIsoStart(this._dateFrom),
        endDate: dateInputToIsoEndExclusive(this._dateTo),
        productionLinkMode
      };
      if (this._orderId) params.orderIds = this._orderId;

      const res = await listReportHistory(params);
      const batches = buildReportBatches(
        res && res.orderReports || [],
        res && res.productReports || [],
        productionLinkMode
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
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
    }
  },

  buildEditMatrixLayout() {
    if (!this._editProduct) return null;
    return buildReportMatrixLayout(
      this._editProduct,
      this._dictionaries,
      this._quantities,
      this._defectiveQuantities
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
      this.getActiveMatrixQtyMap()
    );
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
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
      showAmount: true
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
        this._defectiveQuantities
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
      scrollHeight: computeScrollHeight(readNavBarMetrics(), true)
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
    const index = e.currentTarget.dataset.index;
    this.setData({ [`detail.lineItems[${index}].editGoodQty`]: e.detail.value || '' });
  },

  onLineDefectiveInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`detail.lineItems[${index}].editDefectiveQty`]: e.detail.value || '' });
  },

  onQtyModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'good' && mode !== 'defective') return;
    if (mode === this.data.qtyInputMode) return;
    this.setData({
      qtyInputMode: mode,
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
      this.getActiveMatrixQtyMap()
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
    const qtyMap = this.getActiveMatrixQtyMap();
    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(editMatrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(editMatrixLayout, nextId, qtyMap);
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
        const preview = buildMatrixKeyboardPreview(editMatrixLayout, nextId, qtyMap);
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
    const current = qtyMap[activeMatrixVariantId] || '';
    const _applyMatrixKeyboardK = applyMatrixKeyboardKey(this._matrixKbInput, current, action, digit),value = _applyMatrixKeyboardK.value,replaceConsumed = _applyMatrixKeyboardK.replaceConsumed;
    this.setActiveMatrixQty(activeMatrixVariantId, value);
    if (replaceConsumed) {
      this.setData({ matrixInputReplaceAll: false });
    }
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
      operator
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
      afterSaveReturnToList({
        listUrl: this.reportHistoryListUrl(),
        toastTitle: '已保存'
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: err && err.message || '保存失败', icon: 'none' });
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
      }
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
      afterSaveReturnToList({
        listUrl: this.reportHistoryListUrl(),
        toastTitle: '已删除'
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err && err.message || '删除失败', icon: 'none' });
    }
  },

  onProductImageError() {
    this.setData({ 'detail.showProductImage': false });
  }
});