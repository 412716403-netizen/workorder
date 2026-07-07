const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { buildOutsourceFlowDetailView } = require('../utils/outsourceFlowDetail.js');
const {
  initOutsourceSectionEditState,
  buildOutsourceEditMatrixLayout,
  validateOutsourceFlowEditSave,
  buildOutsourceFlowEditSavePlan,
  splitOutsourceRecords,
} = require('../utils/outsourceFlowDetailEdit.js');
const {
  fetchProductionRecords,
  fetchProductsAll,
  fetchNodesAll,
  fetchTenantConfig,
  fetchCategoriesAll,
  deleteProductionRecord,
  createProductionRecordBatch,
} = require('../utils/orderApi.js');
const { fetchDictionaries, fetchPartnersAll, fetchPartnerCategoriesAll } = require('../utils/planApi.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const { normalizeMasterList } = require('../utils/productionPlans.js');
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
    activeEditSection: '',
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

Page({
  data: {
    loading: true,
    editing: false,
    saving: false,
    detail: null,
    canEdit: false,
    canDelete: false,
    showFooter: false,
    canViewAmount: false,
    partnerName: '',
    partners: [],
    partnerCategories: [],
    dispatchEditMatrixLayout: null,
    receiveEditMatrixLayout: null,
    editDispatchLineItems: [],
    editReceiveLineItems: [],
    editDispatchSingleQty: '0',
    editReceiveSingleQty: '0',
    editDispatchUnitPrice: '',
    editReceiveUnitPrice: '',
    dispatchUseMatrix: false,
    receiveUseMatrix: false,
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    activeEditSection: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    matrixScrollTop: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 400,
  },

  _records: [],
  _dispatchQuantities: {},
  _receiveQuantities: {},
  _receiveUnitPrices: {},
  _product: null,
  _category: null,
  _dictionaries: {},
  _ordersById: new Map(),
  _productionLinkMode: 'order',

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx() || {};
    const perms = ctx.permissions || [];
    if (!hasPermission(perms, 'production:outsource_records:view')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._docNo = options.docNo ? decodeURIComponent(options.docNo) : '';
    this._canEdit = hasPermission(perms, 'production:outsource_records:edit');
    this._canDelete = hasPermission(perms, 'production:outsource_records:delete');
    this._canViewAmount = hasPermission(perms, 'production:outsource_amount:allow');
    this._matrixKbInput = createMatrixKeyboardInputSession();

    const showFooter = this._canEdit || this._canDelete;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      canEdit: this._canEdit,
      canDelete: this._canDelete,
      canViewAmount: this._canViewAmount,
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
    const detail = buildOutsourceFlowDetailView({
      docNo: this._docNo,
      records: this._records,
      ordersById: this._ordersById,
      productsById: this._productsById,
      nodesById: this._nodesById,
      categoryMap: this._categoryMap,
      dictionaries: this._dictionaries,
      productionLinkMode: this._productionLinkMode,
      canViewAmount: this._canViewAmount,
    });
    const showFooter = (this._canEdit || this._canDelete) && !this.data.editing;
    this.setData({
      detail,
      partnerName: detail.partner !== '—' ? detail.partner : this.data.partnerName,
      showFooter,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), showFooter || this.data.editing),
    });
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
        partnersRaw,
        partnerCategoriesRaw,
        recordsRaw,
      ] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchNodesAll(),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchPartnersAll().catch(() => []),
        fetchPartnerCategoriesAll().catch(() => []),
        fetchProductionRecords({ docNo: this._docNo, type: 'OUTSOURCE', all: 'true' }),
      ]);

      this._records = recordsRaw || [];
      this._productionLinkMode = (config && config.productionLinkMode) || 'order';
      this._ordersById = new Map((orders || []).map((o) => [o.id, o]));
      this._productsById = new Map(normalizeMasterList(productsRaw).map((p) => [p.id, p]));
      this._nodesById = new Map(normalizeMasterList(nodesRaw).map((n) => [n.id, n]));
      this._categoryMap = new Map(normalizeMasterList(categoriesRaw).map((c) => [c.id, c]));
      this._dictionaries = dictionariesRaw || {};

      const first = this._records[0] || {};
      const order = first.orderId ? this._ordersById.get(first.orderId) : null;
      this._product = this._productsById.get(first.productId || (order && order.productId)) || null;
      this._category = this._product && this._product.categoryId
        ? this._categoryMap.get(this._product.categoryId)
        : null;

      const partners = normalizeMasterList(partnersRaw);
      const partnerCategories = normalizeMasterList(partnerCategoriesRaw);

      this.setData({
        loading: false,
        partners,
        partnerCategories,
      });
      this.refreshViewModel();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },

  getActiveMatrixQtyMap() {
    return this.data.activeEditSection === 'receive'
      ? this._receiveQuantities
      : this._dispatchQuantities;
  },

  setActiveMatrixQty(variantId, value) {
    if (this.data.activeEditSection === 'receive') {
      this._receiveQuantities[variantId] = value;
    } else {
      this._dispatchQuantities[variantId] = value;
    }
  },

  rebuildEditMatrixLayouts() {
    const dispatchLayout = this.data.dispatchUseMatrix
      ? buildOutsourceEditMatrixLayout(this._product, this._dictionaries, this._dispatchQuantities)
      : null;
    const receiveLayout = this.data.receiveUseMatrix
      ? buildOutsourceEditMatrixLayout(this._product, this._dictionaries, this._receiveQuantities)
      : null;
    this.setData({
      dispatchEditMatrixLayout: dispatchLayout,
      receiveEditMatrixLayout: receiveLayout,
    });
    this.syncMatrixKeyboardPreview();
  },

  syncMatrixKeyboardPreview(variantId) {
    const id = variantId !== undefined ? variantId : this.data.activeMatrixVariantId;
    const layout = this.data.activeEditSection === 'receive'
      ? this.data.receiveEditMatrixLayout
      : this.data.dispatchEditMatrixLayout;
    const qtyMap = this.getActiveMatrixQtyMap();
    const preview = buildMatrixKeyboardPreview(layout, id, qtyMap);
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    });
  },

  exitEditMode() {
    this._dispatchQuantities = {};
    this._receiveQuantities = {};
    this._receiveUnitPrices = {};
    this.setData({
      editing: false,
      dispatchEditMatrixLayout: null,
      receiveEditMatrixLayout: null,
      editDispatchLineItems: [],
      editReceiveLineItems: [],
      ...emptyMatrixKeyboardState(),
    });
    this.refreshViewModel();
  },

  onEnterEdit() {
    if (!this._canEdit || !this._records.length) return;

    const { dispatchRows, receiveRows } = splitOutsourceRecords(this._records);
    const dispatchState = initOutsourceSectionEditState(dispatchRows, this._product, this._category);
    const receiveState = initOutsourceSectionEditState(receiveRows, this._product, this._category);

    this._dispatchQuantities = { ...dispatchState.quantities };
    this._receiveQuantities = { ...receiveState.quantities };
    this._receiveUnitPrices = { ...receiveState.unitPrices };

    const detail = this.data.detail || {};
    this.setData({
      editing: true,
      showFooter: true,
      partnerName: detail.partner !== '—' ? detail.partner : '',
      dispatchUseMatrix: dispatchState.useMatrix,
      receiveUseMatrix: receiveState.useMatrix,
      editDispatchLineItems: dispatchState.lineItems,
      editReceiveLineItems: receiveState.lineItems,
      editDispatchSingleQty: dispatchState.singleQty,
      editReceiveSingleQty: receiveState.singleQty,
      editDispatchUnitPrice: dispatchState.editUnitPrice || '',
      editReceiveUnitPrice: receiveState.editUnitPrice || '',
      dispatchEditMatrixLayout: dispatchState.useMatrix
        ? buildOutsourceEditMatrixLayout(this._product, this._dictionaries, this._dispatchQuantities)
        : null,
      receiveEditMatrixLayout: receiveState.useMatrix
        ? buildOutsourceEditMatrixLayout(this._product, this._dictionaries, this._receiveQuantities)
        : null,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), true),
      ...emptyMatrixKeyboardState(),
    });
  },

  onPartnerChange(e) {
    const name = (e.detail && e.detail.value) || '';
    this.setData({ partnerName: name });
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

  onDispatchSingleQtyInput(e) {
    this.setData({ editDispatchSingleQty: e.detail.value || '' });
  },

  onReceiveSingleQtyInput(e) {
    this.setData({ editReceiveSingleQty: e.detail.value || '' });
  },

  onDispatchLineQtyInput(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`editDispatchLineItems[${index}].editQty`]: e.detail.value || '' });
  },

  onReceiveLineQtyInput(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`editReceiveLineItems[${index}].editQty`]: e.detail.value || '' });
  },

  onReceiveLinePriceInput(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`editReceiveLineItems[${index}].editUnitPrice`]: e.detail.value || '' });
  },

  onReceiveSinglePriceInput(e) {
    this.setData({ editReceiveUnitPrice: e.detail.value || '' });
  },

  onMatrixCellTap(e) {
    const { variantId, section } = e.currentTarget.dataset;
    if (!variantId) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const layout = section === 'receive'
      ? this.data.receiveEditMatrixLayout
      : this.data.dispatchEditMatrixLayout;
    const qtyMap = section === 'receive' ? this._receiveQuantities : this._dispatchQuantities;
    const preview = buildMatrixKeyboardPreview(layout, variantId, qtyMap);
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixVariantId: variantId,
      activeEditSection: section || 'dispatch',
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
    const {
      activeMatrixVariantId,
      activeEditSection,
      dispatchEditMatrixLayout,
      receiveEditMatrixLayout,
    } = this.data;
    const editMatrixLayout = activeEditSection === 'receive'
      ? receiveEditMatrixLayout
      : dispatchEditMatrixLayout;
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
    this.setActiveMatrixQty(activeMatrixVariantId, value);
    if (replaceConsumed) {
      this.setData({ matrixInputReplaceAll: false });
    }
    this.rebuildEditMatrixLayouts();
  },

  onCancelEdit() {
    this.exitEditMode();
  },

  buildDispatchEditState() {
    return {
      useMatrix: this.data.dispatchUseMatrix,
      quantities: this._dispatchQuantities,
      unitPrices: {},
      variantRecordMap: {},
      lineItems: this.data.editDispatchLineItems,
      singleQty: this.data.editDispatchSingleQty,
      editUnitPrice: this.data.editDispatchUnitPrice,
    };
  },

  buildReceiveEditState() {
    return {
      useMatrix: this.data.receiveUseMatrix,
      quantities: this._receiveQuantities,
      unitPrices: this._receiveUnitPrices,
      variantRecordMap: {},
      lineItems: this.data.editReceiveLineItems,
      singleQty: this.data.editReceiveSingleQty,
      editUnitPrice: this.data.editReceiveUnitPrice,
    };
  },

  async onSaveEdit() {
    if (!this._canEdit || !this._records.length || this.data.saving) return;
    const detail = this.data.detail;
    if (!detail) return;

    const { dispatchRows, receiveRows } = splitOutsourceRecords(this._records);
    const dispatchState = this.buildDispatchEditState();
    const receiveState = this.buildReceiveEditState();

    const errMsg = validateOutsourceFlowEditSave({
      partnerName: this.data.partnerName,
      dispatchState,
      receiveState,
      dispatchMatrixLayout: this.data.dispatchEditMatrixLayout,
      receiveMatrixLayout: this.data.receiveEditMatrixLayout,
      hasDispatch: dispatchRows.length > 0,
      hasReceive: receiveRows.length > 0,
    });
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' });
      return;
    }

    const plan = buildOutsourceFlowEditSavePlan({
      records: this._records,
      partnerName: this.data.partnerName,
      operator: (detail.editOperator || '').trim(),
      editDate: detail.editDate,
      editTime: detail.editTime,
      docNo: this._docNo,
      productionLinkMode: this._productionLinkMode,
      ordersById: this._ordersById,
      dispatchState,
      receiveState,
      dispatchMatrixLayout: this.data.dispatchEditMatrixLayout,
      receiveMatrixLayout: this.data.receiveEditMatrixLayout,
    });

    if (!plan.createBatch.length) {
      wx.showToast({ title: '请填写数量', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      for (let i = 0; i < plan.deleteIds.length; i += 1) {
        await deleteProductionRecord(plan.deleteIds[i]);
      }
      await createProductionRecordBatch(plan.createBatch);
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.OUTSOURCE_FLOW,
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
      title: '删除外协单',
      content: '确定要删除该张外协单的所有记录吗？此操作不可恢复。',
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
        listUrl: LIST_ROUTES.OUTSOURCE_FLOW,
        toastTitle: '已删除',
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  },
});
