const { readOperatorDisplayName } = require('../../utils/session.js');
const { PSI_TRANSFER_TYPE } = require('../config/warehouses.js');
const {
  buildInitialForm,
  createEmptyLine,
  recordsToLineItems,
  enrichLineForUi,
  lineTotalQty,
  validateTransferSave,
  validateTransferBatchStock,
  buildTransferSaveRecords,
  generateTRDocNumber,
  resolvePreferredTransferWarehouses,
  writeTransferPreference,
} = require('../utils/warehouseTransferForm.js');
const { attachMergeBatchesToLine } = require('../utils/purchaseBillBatch.js');
const { buildProductMap, buildCategoryMap } = require('../utils/purchaseOrders.js');
const { groupRecordsByDocNumber } = require('../utils/psiOpsAggregators.js');
const {
  fetchAllPsiRecords,
  createPsiRecordsBatch,
  replacePsiRecords,
} = require('../utils/psiApi.js');
const { fetchProductsAll, fetchCategoriesAll, fetchDictionaries } = require('../utils/planApi.js');
const { fetchWarehousesAll, fetchStockBatches, fetchStockSnapshot } = require('../utils/orderApi.js');
const { buildStockSnapshotIndex } = require('../utils/warehouseStock.js');
const { normalizeAppDictionaries, normalizeMasterList } = require('../utils/productionPlans.js');
const { createMatrixKeyboardInputSession } = require('../utils/matrixQtyKeyboard.js');
const {
  emptyMatrixKeyboardState,
  handleMatrixCellTap,
  handleMatrixKeyboardAction,
} = require('../utils/psiFormMatrixKeyboard.js');
const { readNavBarMetrics, readWindowMetrics, computePlanCreateHeaderHeight } = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../utils/saveNavigation.js');

Page({
  data: {
    loading: true,
    submitting: false,
    editing: false,
    title: '登记调拨',
    form: buildInitialForm(),
    lines: [],
    products: [],
    categories: [],
    warehouses: [],
    warehouseNames: [],
    fromWarehouseIndex: 0,
    toWarehouseIndex: 0,
    totalQtyText: '0',
    canSubmit: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    matrixScrollTop: 0,
    ...emptyMatrixKeyboardState(),
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    const editing = Boolean(docNumber);
    this._editingDocNumber = docNumber;
    this._matrixKbInput = createMatrixKeyboardInputSession();
    const win = readWindowMetrics();
    const rpx = win.windowWidth / 750;
    this.setData({
      editing,
      title: editing ? '编辑调拨' : '登记调拨',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: Math.max(200, (win.windowHeight || 667) - computePlanCreateHeaderHeight(nav) - Math.ceil(128 * rpx) - (win.safeAreaBottom || 0)),
    });
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async loadStockIndex() {
    const snapshotRaw = await fetchStockSnapshot();
    this._stockIndex = buildStockSnapshotIndex(snapshotRaw);
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [products, categories, dictionaries, warehouses, records] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => []),
        fetchAllPsiRecords(PSI_TRANSFER_TYPE).catch(() => []),
      ]);
      await this.loadStockIndex();
      this._products = normalizeMasterList(products);
      this._categories = normalizeMasterList(categories);
      this._productMap = buildProductMap(this._products);
      this._categoryMap = buildCategoryMap(this._categories);
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      this._allRecords = records || [];
      const whList = Array.isArray(warehouses) ? warehouses : (warehouses.data || []);
      this._warehouses = whList;
      const warehouseNames = whList.map((w) => w.name || w.id);
      const preferred = resolvePreferredTransferWarehouses(whList);
      let form = buildInitialForm();
      let lines = [createEmptyLine()];
      let fromIdx = Math.max(0, whList.findIndex((w) => w.id === preferred.fromWarehouseId));
      let toIdx = Math.max(0, whList.findIndex((w) => w.id === preferred.toWarehouseId));
      if (this._editingDocNumber) {
        const items = groupRecordsByDocNumber(this._allRecords, PSI_TRANSFER_TYPE)[this._editingDocNumber];
        if (!items || !items.length) {
          wx.showToast({ title: '未找到调拨单', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
        const first = items[0];
        fromIdx = Math.max(0, whList.findIndex((w) => w.id === first.fromWarehouseId));
        toIdx = Math.max(0, whList.findIndex((w) => w.id === first.toWarehouseId));
        form = {
          ...form,
          fromWarehouseId: first.fromWarehouseId || '',
          fromWarehouseName: (whList[fromIdx] && whList[fromIdx].name) || '',
          toWarehouseId: first.toWarehouseId || '',
          toWarehouseName: (whList[toIdx] && whList[toIdx].name) || '',
          docNumber: this._editingDocNumber,
          note: first.note || '',
          operator: first.operator || '',
          transferDate: first.createdAt || form.transferDate,
        };
        lines = recordsToLineItems(items, this._productMap, this._categoryMap, this._dictionaries);
        this._deleteIds = items.map((r) => r.id);
        this._savedTimestamp = first.timestamp || new Date().toISOString();
      } else {
        const fromWh = whList[fromIdx];
        const toWh = whList[toIdx];
        form = {
          ...form,
          fromWarehouseId: (fromWh && fromWh.id) || '',
          fromWarehouseName: (fromWh && fromWh.name) || '',
          toWarehouseId: (toWh && toWh.id) || '',
          toWarehouseName: (toWh && toWh.name) || '',
        };
      }
      this._form = form;
      this._lines = lines.length ? lines : [createEmptyLine()];
      this.setData({
        loading: false,
        form,
        warehouses: whList,
        warehouseNames,
        fromWarehouseIndex: fromIdx,
        toWarehouseIndex: toIdx,
        products: this._products,
        categories: this._categories,
      });
      this.refreshLinesUi();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  refreshLinesUi() {
    const fromId = (this._form && this._form.fromWarehouseId) || '';
    const lines = (this._lines || []).map((l) => {
      const enriched = enrichLineForUi(
        l,
        this._productMap,
        this._categoryMap,
        this._dictionaries,
        this._stockIndex,
        fromId,
      );
      return attachMergeBatchesToLine(enriched, this._allRecords, fromId);
    });
    const totalQty = (this._lines || []).reduce((s, l) => s + lineTotalQty(l), 0);
    const canSubmit = (this._lines || []).some((l) => l.productId && lineTotalQty(l) > 0);
    this.setData({
      lines,
      form: this._form,
      totalQtyText: String(totalQty),
      canSubmit,
    });
  },

  onFromWarehouseChange(e) {
    const idx = Number(e.detail.value) || 0;
    const wh = (this._warehouses || [])[idx];
    if (!wh) return;
    this._form = { ...this._form, fromWarehouseId: wh.id, fromWarehouseName: wh.name || wh.id };
    this.setData({ fromWarehouseIndex: idx, form: this._form });
    this.refreshLinesUi();
  },

  onToWarehouseChange(e) {
    const idx = Number(e.detail.value) || 0;
    const wh = (this._warehouses || [])[idx];
    if (!wh) return;
    this._form = { ...this._form, toWarehouseId: wh.id, toWarehouseName: wh.name || wh.id };
    this.setData({ toWarehouseIndex: idx, form: this._form });
  },

  onNoteInput(e) {
    this._form = { ...this._form, note: e.detail.value || '' };
    this.setData({ form: this._form });
  },

  onAddLine() {
    this._lines = [...(this._lines || []), createEmptyLine()];
    this.refreshLinesUi();
  },

  onRemoveLine(e) {
    const lineId = e.currentTarget.dataset.lineId;
    this._lines = (this._lines || []).filter((l) => l.id !== lineId);
    if (!this._lines.length) this._lines = [createEmptyLine()];
    this.refreshLinesUi();
  },

  onLineProductChange(e) {
    const lineId = e.currentTarget.dataset.lineId;
    const { id, name } = e.detail || {};
    this._lines = (this._lines || []).map((l) => (
      l.id === lineId
        ? { ...l, productId: id || '', productName: name || '', variantQuantities: {}, quantity: '', batch: '' }
        : l
    ));
    this.refreshLinesUi();
  },

  onLineQtyInput(e) {
    const lineId = e.currentTarget.dataset.lineId;
    this._lines = (this._lines || []).map((l) => (l.id === lineId ? { ...l, quantity: e.detail.value } : l));
    this.refreshLinesUi();
  },

  onLineBatchChange(e) {
    const lineId = e.currentTarget.dataset.lineId;
    const value = e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this._lines = (this._lines || []).map((l) => (l.id === lineId ? { ...l, batch: value } : l));
    this.refreshLinesUi();
  },

  onMatrixCellTap(e) {
    handleMatrixCellTap(this, e);
  },

  onMatrixKeyboardAction(e) {
    handleMatrixKeyboardAction(this, e, { onLinesUpdated: () => this.refreshLinesUi() });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const err = validateTransferSave(this._form, this._lines, this._productMap, this._categoryMap);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const batchErr = await validateTransferBatchStock(
      this._lines,
      this._form.fromWarehouseId,
      this._productMap,
      this._categoryMap,
      fetchStockBatches,
    );
    if (batchErr) {
      wx.showToast({ title: batchErr, icon: 'none' });
      return;
    }
    const docNumber = this._form.docNumber
      || this._editingDocNumber
      || generateTRDocNumber(this._allRecords || []);
    if (!docNumber) {
      wx.showToast({ title: '生成单号失败', icon: 'none' });
      return;
    }
    this._form.docNumber = docNumber;
    const operator = readOperatorDisplayName();
    const timestamp = this._savedTimestamp || new Date().toISOString();
    const newRecords = buildTransferSaveRecords(
      this._form,
      this._lines,
      this._productMap,
      this._categoryMap,
      docNumber,
      timestamp,
      operator,
    );
    if (!newRecords.length) {
      wx.showToast({ title: '请填写调拨数量', icon: 'none' });
      return;
    }
    writeTransferPreference(this._form.fromWarehouseId, this._form.toWarehouseId);
    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中…' });
    try {
      if (this._editingDocNumber) {
        await replacePsiRecords(this._deleteIds || [], newRecords);
      } else {
        await createPsiRecordsBatch(newRecords);
      }
      wx.hideLoading();
      this.setData({ submitting: false });
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.PSI_WAREHOUSE_TRANSFER,
        toastTitle: '保存成功',
        alsoRefreshListUrls: [LIST_ROUTES.PSI_WAREHOUSES, LIST_ROUTES.PSI_WAREHOUSE_FLOW],
      });
    } catch (submitErr) {
      wx.hideLoading();
      this.setData({ submitting: false });
      const msg = (submitErr && submitErr.message) || '保存失败';
      wx.showToast({
        title: msg.length > 40 ? `${msg.slice(0, 40)}…` : msg,
        icon: 'none',
        duration: 3500,
      });
    }
  },
});
