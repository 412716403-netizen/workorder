const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { buildDefectFlowDetailView } = require('../../utils/reworkDefectFlowDetail.js');
const {
  buildDefectFlowEditMatrixLayout,
  buildDefectFlowEditSavePlan,
} = require('../../utils/reworkDefectFlowDetailEdit.js');
const {
  fetchProductionRecords,
  fetchProductsAll,
  fetchNodesAll,
  fetchTenantConfig,
  fetchCategoriesAll,
  updateProductionRecord,
  deleteProductionRecord,
} = require('../../utils/orderApi.js');
const { fetchDictionaries } = require('../../utils/planApi.js');
const { fetchAllOrdersPaginated } = require('../../utils/pendingStockBadge.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');
const {
  activateMatrixKeyboardCell,
  applyMatrixKeyboardKey,
  buildMatrixKeyboardPreview,
  createMatrixKeyboardInputSession,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');
const { readNavBarMetrics, readWindowMetrics, computePlanCreateHeaderHeight } = require('../../utils/windowMetrics.js');
const { afterMatrixKeyboardOpen } = require('../../utils/matrixKeyboardLayout.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');

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
    editLineItems: [],
    editMatrixLayout: null,
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
  _editLineItems: [],
  _product: null,
  _ordersById: new Map(),
  _productsById: new Map(),
  _nodesById: new Map(),
  _categoriesById: new Map(),
  _dictionaries: {},
  _productionLinkMode: 'order',

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx() || {};
    const perms = ctx.permissions || [];
    if (!hasPermission(perms, 'production:rework_records:view')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._docNo = options.docNo ? decodeURIComponent(options.docNo) : '';
    this._canEdit = hasPermission(perms, 'production:rework_records:edit');
    this._canDelete = hasPermission(perms, 'production:rework_records:delete');
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
    const detail = buildDefectFlowDetailView(this._records, {
      ordersById: this._ordersById,
      productsById: this._productsById,
      nodesById: this._nodesById,
      categoriesById: this._categoriesById,
      dictionaries: this._dictionaries,
    });
    const showFooter = (this._canEdit || this._canDelete) && !this.data.editing;
    if (detail) {
      detail.editOperator = detail.operator && detail.operator !== '—' ? detail.operator : '';
    }
    this.setData({
      detail,
      showFooter,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), showFooter || this.data.editing),
    });
  },

  rebuildEditMatrixLayout() {
    const editMatrixLayout = this._product && this.data.detail && this.data.detail.showMatrix
      ? buildDefectFlowEditMatrixLayout(this._product, this._dictionaries, this._editLineItems)
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

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [
        config,
        orders,
        productsRaw,
        nodesRaw,
        categoriesRaw,
        dictionariesRaw,
        recordsRaw,
      ] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchNodesAll(),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchProductionRecords({ docNo: this._docNo, types: 'REWORK,SCRAP', all: 'true' }),
      ]);

      this._records = recordsRaw || [];
      if (!this._records.length) {
        this.setData({ loading: false, detail: null });
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      this._productionLinkMode = (config && config.productionLinkMode) || 'order';
      this._ordersById = new Map((orders || []).map((o) => [o.id, o]));
      this._productsById = new Map(normalizeMasterList(productsRaw).map((p) => [p.id, p]));
      this._nodesById = new Map(normalizeMasterList(nodesRaw).map((n) => [n.id, n]));
      this._categoriesById = new Map(normalizeMasterList(categoriesRaw).map((c) => [c.id, c]));
      this._dictionaries = dictionariesRaw || {};

      const first = this._records[0] || {};
      const order = first.orderId ? this._ordersById.get(first.orderId) : null;
      this._product = this._productsById.get(first.productId || (order && order.productId)) || null;

      this.setData({ loading: false });
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
      ? buildDefectFlowEditMatrixLayout(this._product, this._dictionaries, this._editLineItems)
      : null;

    this.setData({
      editing: true,
      showFooter: true,
      editLineItems: this._editLineItems,
      editMatrixLayout,
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

    const plan = buildDefectFlowEditSavePlan({
      records: this._records,
      lineItems: this._editLineItems,
      editDate: detail.editDate,
      editTime: detail.editTime,
      operator: (detail.editOperator || detail.operator || '').trim(),
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
        });
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.REWORK_DEFECT_FLOW,
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
      title: '删除处理不良单',
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
        listUrl: LIST_ROUTES.REWORK_DEFECT_FLOW,
        toastTitle: '已删除',
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  },
});
