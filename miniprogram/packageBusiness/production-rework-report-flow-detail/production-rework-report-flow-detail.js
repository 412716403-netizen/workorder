const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { buildReworkReportFlowDetailView } = require('../utils/reworkReportFlowDetail.js');
const { buildReworkByIdMap } = require('../utils/reworkReportOperator.js');
const {
  buildReportFlowEditMatrixLayout,
  buildReportFlowEditSavePlan,
} = require('../utils/reworkReportFlowDetailEdit.js');
const {
  fetchProductionRecords,
  fetchProductsAll,
  fetchNodesAll,
  fetchTenantConfig,
  fetchCategoriesAll,
  fetchWorkersForReport,
  updateProductionRecord,
  deleteProductionRecord,
} = require('../utils/orderApi.js');
const { fetchDictionaries, fetchEquipmentAll } = require('../utils/planApi.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const { normalizeMasterList } = require('../utils/productionPlans.js');
const { normalizeWorkersList, filterEntitiesForNode } = require('../utils/orderReportForm.js');
const {
  activateMatrixKeyboardCell,
  applyMatrixKeyboardKey,
  buildMatrixKeyboardPreview,
  createMatrixKeyboardInputSession,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../utils/matrixQtyKeyboard.js');
const { readNavBarMetrics, readWindowMetrics, computePlanCreateHeaderHeight } = require('../../utils/windowMetrics.js');
const { afterMatrixKeyboardOpen } = require('../utils/matrixKeyboardLayout.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../utils/saveNavigation.js');

function computeHeaderBlockHeight(nav) {
  return computePlanCreateHeaderHeight(nav);
}

function emptyMatrixKeyboardState() {
  return {
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
  };
}

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = hasFooter ? Math.ceil(120 * rpx) + (win.safeAreaBottom || 0) : 0;
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, win.windowHeight - headerPx - footerPx);
}

function syncVariantQtyToLineItems(lineItems, variantId, qty) {
  const items = (lineItems || []).filter((item) => (item.variantId || '') === variantId);
  if (!items.length) return;
  const n = Number(qty) || 0;
  items[0].quantity = n;
  for (let i = 1; i < items.length; i += 1) {
    items[i].quantity = 0;
  }
}

Page({
  data: {
    loading: true,
    editing: false,
    saving: false,
    detail: null,
    canEdit: false,
    canDelete: false,
    showFooter: false,
    canViewAmount: true,
    editLineItems: [],
    editMatrixLayout: null,
    editUnitPrice: '',
    workers: [],
    workerId: '',
    workerName: '',
    equipmentNames: [],
    equipmentPickerIndex: 0,
    equipmentId: '',
    equipmentName: '',
    showEquipmentField: false,
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    matrixScrollTop: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 400,
  },

  _records: [],
  _allRecords: [],
  _reworkById: new Map(),
  _editLineItems: [],
  _product: null,
  _node: null,
  _equipment: [],
  _ordersById: new Map(),
  _productsById: new Map(),
  _nodesById: new Map(),
  _workersById: new Map(),
  _equipmentById: new Map(),
  _categoriesById: new Map(),
  _dictionaries: {},
  _productionLinkMode: 'order',

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx() || {};
    const perms = ctx.permissions || [];
    if (!hasPermission(perms, 'production:rework_report_records:view')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._docNo = options.docNo ? decodeURIComponent(options.docNo) : '';
    this._canEdit = hasPermission(perms, 'production:rework_report_records:edit');
    this._canDelete = hasPermission(perms, 'production:rework_report_records:delete');
    this._matrixKbInput = createMatrixKeyboardInputSession();

    const showFooter = this._canEdit || this._canDelete;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canEdit: this._canEdit,
      canDelete: this._canDelete,
      showFooter,
      scrollHeight: computeScrollHeight(nav, showFooter),
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

  onProductImageError() {
    this.setData({ 'detail.showProductImage': false });
  },

  refreshViewModel() {
    const detail = buildReworkReportFlowDetailView(this._records, {
      ordersById: this._ordersById,
      productsById: this._productsById,
      nodesById: this._nodesById,
      categoriesById: this._categoriesById,
      dictionaries: this._dictionaries,
      workersById: this._workersById,
      equipmentById: this._equipmentById,
      canViewAmount: this.data.canViewAmount,
      allRecords: this._allRecords,
      reworkById: this._reworkById,
    });
    const showFooter = (this._canEdit || this._canDelete) && !this.data.editing;
    if (detail) {
      detail.editOperator = !detail.isOutsourceReworkReport && detail.operatorsLabel && detail.operatorsLabel !== '—'
        ? detail.operatorsLabel
        : '';
    }
    this.setData({
      detail,
      showFooter,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), showFooter || this.data.editing),
    });
  },

  rebuildEditMatrixLayout() {
    const editMatrixLayout = this._product && this.data.detail && this.data.detail.showMatrix
      ? buildReportFlowEditMatrixLayout(this._product, this._dictionaries, this._editLineItems)
      : null;
    this.setData({ editMatrixLayout });
    this.syncMatrixKeyboardPreview();
  },

  syncMatrixKeyboardPreview(variantId) {
    const id = variantId !== undefined ? variantId : this.data.activeMatrixVariantId;
    const preview = buildMatrixKeyboardPreview(
      this.data.editMatrixLayout,
      id,
      this.buildMatrixQtyMap(),
    );
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    });
  },

  buildMatrixQtyMap() {
    const map = {};
    (this._editLineItems || []).forEach((item) => {
      const vid = item.variantId || '';
      map[vid] = String(item.quantity || 0);
    });
    return map;
  },

  initEquipmentPicker(equipmentId) {
    const list = this._equipment || [];
    const idx = Math.max(0, list.findIndex((e) => e.id === equipmentId));
    const eq = list[idx];
    this.setData({
      equipmentNames: list.map((e) => e.name || e.code || e.id),
      equipmentPickerIndex: idx,
      equipmentId: eq ? eq.id : '',
      equipmentName: eq ? (eq.name || eq.code || '') : '',
    });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const ctx = readTenantCtx() || {};
      const [
        config,
        orders,
        productsRaw,
        nodesRaw,
        categoriesRaw,
        dictionariesRaw,
        workersRaw,
        equipmentRaw,
        recordsRaw,
      ] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchNodesAll(),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchWorkersForReport(ctx.tenantId).catch(() => []),
        fetchEquipmentAll().catch(() => []),
        fetchProductionRecords({ docNo: this._docNo, type: 'REWORK_REPORT', all: 'true' }),
      ]);

      this._records = recordsRaw || [];
      if (!this._records.length) {
        this.setData({ loading: false, detail: null });
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      const orderIds = [...new Set(this._records.map((r) => r.orderId).filter(Boolean))].join(',');
      let reworkRaw = [];
      if (orderIds) {
        reworkRaw = await fetchProductionRecords({ types: 'REWORK', orderIds, all: 'true' }).catch(() => []);
      }
      this._allRecords = [...this._records, ...(reworkRaw || [])];
      this._reworkById = buildReworkByIdMap(this._allRecords);

      this._productionLinkMode = (config && config.productionLinkMode) || 'order';
      this._ordersById = new Map((orders || []).map((o) => [o.id, o]));
      this._productsById = new Map(normalizeMasterList(productsRaw).map((p) => [p.id, p]));
      this._nodesById = new Map(normalizeMasterList(nodesRaw).map((n) => [n.id, n]));
      this._categoriesById = new Map(normalizeMasterList(categoriesRaw).map((c) => [c.id, c]));
      this._dictionaries = dictionariesRaw || {};

      const workers = normalizeWorkersList(workersRaw).filter(
        (w) => !w.status || w.status === 'ACTIVE',
      );
      this._workersById = new Map(workers.map((w) => [w.id, w]));

      const first = this._records[0] || {};
      const order = first.orderId ? this._ordersById.get(first.orderId) : null;
      this._product = this._productsById.get(first.productId || (order && order.productId)) || null;
      this._node = this._nodesById.get(first.nodeId) || null;

      const equipmentFeaturesEnabled = ctx.equipmentFeaturesEnabled !== false;
      this._equipment = equipmentFeaturesEnabled
        ? filterEntitiesForNode(equipmentRaw, this._node && this._node.templateId)
        : [];
      this._equipmentById = new Map(this._equipment.map((e) => [e.id, e]));

      this.setData({
        loading: false,
        workers,
        showEquipmentField: equipmentFeaturesEnabled && this._equipment.length > 0,
      });
      this.refreshViewModel();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },

  exitEditMode() {
    this._editLineItems = [];
    this.setData({
      editing: false,
      editLineItems: [],
      editMatrixLayout: null,
      ...emptyMatrixKeyboardState(),
    });
    this.refreshViewModel();
  },

  onEnterEdit() {
    if (!this._canEdit || !this._records.length) return;
    const detail = this.data.detail;
    if (!detail) return;

    this._editLineItems = (detail.lineItems || []).map((item) => ({
      id: item.id,
      quantity: item.quantity,
      variantId: item.variantId || '',
      editQty: String(item.quantity || 0),
    }));

    const editMatrixLayout = detail.showMatrix
      ? buildReportFlowEditMatrixLayout(this._product, this._dictionaries, this._editLineItems)
      : null;

    this.initEquipmentPicker(detail.equipmentId || '');

    this.setData({
      editing: true,
      showFooter: true,
      editLineItems: this._editLineItems,
      editMatrixLayout,
      editUnitPrice: detail.unitPrice > 0 ? String(detail.unitPrice) : '',
      workerId: detail.workerId || '',
      workerName: detail.workerName || '',
      scrollHeight: computeScrollHeight(readNavBarMetrics(), true),
      ...emptyMatrixKeyboardState(),
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

  onWorkerChange(e) {
    const workerId = (e.detail && e.detail.valueId) || '';
    const workerName = (e.detail && e.detail.valueName) || '';
    this.setData({ workerId, workerName });
  },

  onEquipmentChange(e) {
    const idx = Number(e.detail.value) || 0;
    const eq = (this._equipment || [])[idx];
    if (!eq) return;
    this.setData({
      equipmentPickerIndex: idx,
      equipmentId: eq.id,
      equipmentName: eq.name || eq.code || '',
    });
  },

  onUnitPriceInput(e) {
    this.setData({ editUnitPrice: e.detail.value || '' });
  },

  onLineQtyInput(e) {
    const { index } = e.currentTarget.dataset;
    const qty = Number(e.detail.value) || 0;
    if (this._editLineItems[index]) {
      this._editLineItems[index].quantity = qty;
    }
    this.setData({ [`editLineItems[${index}].editQty`]: e.detail.value || '' });
  },

  onMatrixCellTap(e) {
    const { variantId } = e.currentTarget.dataset;
    if (!variantId) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      this.data.editMatrixLayout,
      variantId,
      this.buildMatrixQtyMap(),
    );
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    }, () => {
      afterMatrixKeyboardOpen(this, '.plan-detail-scroll');
    });
  },

  onMatrixKeyboardAction(e) {
    const { action, digit } = e.detail || {};
    if (action === 'confirm') {
      this.setData(emptyMatrixKeyboardState());
      return;
    }
    const { activeMatrixVariantId, editMatrixLayout } = this.data;
    const qtyMap = this.buildMatrixQtyMap();

    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(editMatrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(editMatrixLayout, nextId, qtyMap);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
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
          matrixKeyboardValue: preview.value,
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
    const { value, replaceConsumed } = applyMatrixKeyboardKey(this._matrixKbInput, current, action, digit);
    syncVariantQtyToLineItems(this._editLineItems, activeMatrixVariantId, value);
    if (replaceConsumed) {
      this.setData({ matrixInputReplaceAll: false });
    }
    this.rebuildEditMatrixLayout();
  },

  onCancelEdit() {
    this.exitEditMode();
  },

  async onSaveEdit() {
    if (!this._canEdit || !this._records.length || this.data.saving) return;
    const detail = this.data.detail;
    if (!detail) return;

    const plan = buildReportFlowEditSavePlan({
      records: this._records,
      lineItems: this._editLineItems,
      editDate: detail.editDate,
      editTime: detail.editTime,
      operator: detail.isOutsourceReworkReport
        ? ''
        : (detail.editOperator || detail.operatorsLabel || '').trim(),
      workerId: this.data.workerId,
      equipmentId: this.data.equipmentId,
      unitPrice: this.data.editUnitPrice,
    });

    if (plan.error) {
      wx.showToast({ title: plan.error, icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      for (let i = 0; i < (plan.deletes || []).length; i += 1) {
        await deleteProductionRecord(plan.deletes[i]);
      }
      for (let i = 0; i < (plan.updates || []).length; i += 1) {
        const u = plan.updates[i];
        await updateProductionRecord(u.id, {
          quantity: u.quantity,
          operator: u.operator,
          timestamp: u.timestamp,
          workerId: u.workerId,
          equipmentId: u.equipmentId,
          unitPrice: u.unitPrice,
          amount: u.amount,
        });
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.REWORK_REPORT_FLOW,
        toastTitle: '已保存',
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    }
  },

  onDeleteTap() {
    if (!this._canDelete || !this._records.length) return;
    wx.showModal({
      title: '删除返工报工单',
      content: '确定要删除该张单据的所有记录吗？此操作不可恢复。',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) this.deleteDoc();
      },
    });
  },

  async deleteDoc() {
    wx.showLoading({ title: '删除中…', mask: true });
    try {
      for (let i = 0; i < this._records.length; i += 1) {
        await deleteProductionRecord(this._records[i].id);
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.REWORK_REPORT_FLOW,
        toastTitle: '已删除',
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  },
});
