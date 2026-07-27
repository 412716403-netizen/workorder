const _require = require('../../utils/session.js'),readOperatorDisplayName = _require.readOperatorDisplayName;
const _require2 = require('../config/warehouses.js'),PSI_TRANSFER_TYPE = _require2.PSI_TRANSFER_TYPE;
const _require3 =











  require('../utils/warehouseTransferForm.js'),buildInitialForm = _require3.buildInitialForm,createEmptyLine = _require3.createEmptyLine,recordsToLineItems = _require3.recordsToLineItems,enrichLineForUi = _require3.enrichLineForUi,lineTotalQty = _require3.lineTotalQty,validateTransferSave = _require3.validateTransferSave,validateTransferBatchStock = _require3.validateTransferBatchStock,buildTransferSaveRecords = _require3.buildTransferSaveRecords,generateTRDocNumber = _require3.generateTRDocNumber,resolvePreferredTransferWarehouses = _require3.resolvePreferredTransferWarehouses,writeTransferPreference = _require3.writeTransferPreference,hydrateEntryDate = _require3.hydrateEntryDate;
const _require4 = require('../utils/purchaseBillBatch.js'),attachMergeBatchesToLine = _require4.attachMergeBatchesToLine;
const _require5 = require('../../utils/purchaseOrders.js'),buildProductMap = _require5.buildProductMap,buildCategoryMap = _require5.buildCategoryMap;
const _require6 = require('../../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require6.groupRecordsByDocNumber;
const _require7 =



  require('../../utils/psiApi.js'),fetchAllPsiRecords = _require7.fetchAllPsiRecords,createPsiRecordsBatch = _require7.createPsiRecordsBatch,replacePsiRecords = _require7.replacePsiRecords;
const _require8 = require('../../utils/planApi.js'),fetchProductsAll = _require8.fetchProductsAll,fetchCategoriesAll = _require8.fetchCategoriesAll,fetchDictionaries = _require8.fetchDictionaries,fetchPartnersAll = _require8.fetchPartnersAll;
const _require9 = require('../../utils/orderApi.js'),fetchWarehousesAll = _require9.fetchWarehousesAll,fetchStockBatches = _require9.fetchStockBatches,fetchStockSnapshot = _require9.fetchStockSnapshot;
const _require0 = require('../utils/warehouseStock.js'),buildStockSnapshotIndex = _require0.buildStockSnapshotIndex;
const _require1 = require('../../utils/productionPlans.js'),normalizeAppDictionaries = _require1.normalizeAppDictionaries,normalizeMasterList = _require1.normalizeMasterList;
const _require10 = require('../../utils/matrixQtyKeyboard.js'),createMatrixKeyboardInputSession = _require10.createMatrixKeyboardInputSession;
const _require11 =



  require('../utils/psiFormMatrixKeyboard.js'),emptyMatrixKeyboardState = _require11.emptyMatrixKeyboardState,handleMatrixCellTap = _require11.handleMatrixCellTap,handleMatrixKeyboardAction = _require11.handleMatrixKeyboardAction;
const { handleMatrixOutsideTap } = require('../../utils/matrixKeyboardLayout.js');
const _require12 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require12.readNavBarMetrics,readWindowMetrics = _require12.readWindowMetrics,computePlanCreateHeaderHeight = _require12.computePlanCreateHeaderHeight;
const _require13 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require13.LIST_ROUTES,afterSaveReturnToList = _require13.afterSaveReturnToList;

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
    partners: [],
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
    pickerSheetOpen: false,
    ...emptyMatrixKeyboardState()
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
      scrollHeight: Math.max(200, (win.windowHeight || 667) - computePlanCreateHeaderHeight(nav) - Math.ceil(128 * rpx) - (win.safeAreaBottom || 0))
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
      const [products, categories, dictionaries, warehouses, records, partners] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => []),
        fetchAllPsiRecords(PSI_TRANSFER_TYPE).catch(() => []),
        fetchPartnersAll().catch(() => [])
      ]);
      await this.loadStockIndex();
      this._products = normalizeMasterList(products);
      this._categories = normalizeMasterList(categories);
      this._partners = normalizeMasterList(partners);
      this._productMap = buildProductMap(this._products);
      this._categoryMap = buildCategoryMap(this._categories);
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      this._allRecords = records || [];
      const whList = Array.isArray(warehouses) ? warehouses : warehouses.data || [];
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
          fromWarehouseName: whList[fromIdx] && whList[fromIdx].name || '',
          toWarehouseId: first.toWarehouseId || '',
          toWarehouseName: whList[toIdx] && whList[toIdx].name || '',
          docNumber: this._editingDocNumber,
          note: first.note || '',
          operator: first.operator || '',
          transferDate: hydrateEntryDate(first.createdAt),
        };
        lines = recordsToLineItems(items, this._productMap, this._categoryMap, this._dictionaries);
        this._deleteIds = items.map((r) => r.id);
        this._savedTimestamp = first.timestamp || new Date().toISOString();
      } else {
        const fromWh = whList[fromIdx];
        const toWh = whList[toIdx];
        form = {
          ...form,
          fromWarehouseId: fromWh && fromWh.id || '',
          fromWarehouseName: fromWh && fromWh.name || '',
          toWarehouseId: toWh && toWh.id || '',
          toWarehouseName: toWh && toWh.name || ''
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
        partners: this._partners
      });
      this.refreshLinesUi();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  refreshLinesUi() {
    const fromId = this._form && this._form.fromWarehouseId || '';
    const lines = (this._lines || []).map((l) => {
      const enriched = enrichLineForUi(
        l,
        this._productMap,
        this._categoryMap,
        this._dictionaries,
        this._stockIndex,
        fromId
      );
      return attachMergeBatchesToLine(enriched, this._allRecords, fromId);
    });
    const totalQty = (this._lines || []).reduce((s, l) => s + lineTotalQty(l), 0);
    const canSubmit = (this._lines || []).some((l) => l.productId && lineTotalQty(l) > 0);
    this.setData({
      lines,
      form: this._form,
      totalQtyText: String(totalQty),
      canSubmit
    });
  },

  onTransferDateChange(e) {
    const transferDate = (e.detail && e.detail.value) || '';
    this._form = { ...this._form, transferDate };
    this.setData({ form: this._form });
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
    const _ref = e.detail || {},id = _ref.id,name = _ref.name;
    this._lines = (this._lines || []).map((l) =>
    l.id === lineId ?
    { ...l, productId: id || '', productName: name || '', variantQuantities: {}, quantity: '', batch: '' } :
    l
    );
    this.refreshLinesUi();
  },

  onLineQtyInput(e) {
    const lineId = e.currentTarget.dataset.lineId;
    this._lines = (this._lines || []).map((l) => l.id === lineId ? { ...l, quantity: e.detail.value } : l);
    this.refreshLinesUi();
  },

  onLineBatchChange(e) {
    const lineId = e.currentTarget.dataset.lineId;
    const value = e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this._lines = (this._lines || []).map((l) => l.id === lineId ? { ...l, batch: value } : l);
    this.refreshLinesUi();
  },

  onMatrixCellTap(e) {
    handleMatrixCellTap(this, e);
  },

  onMatrixOutsideTap() {
    handleMatrixOutsideTap(this);
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
      fetchStockBatches
    );
    if (batchErr) {
      wx.showToast({ title: batchErr, icon: 'none' });
      return;
    }
    const docNumber = this._form.docNumber ||
    this._editingDocNumber ||
    generateTRDocNumber(this._allRecords || []);
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
      operator
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
        alsoRefreshListUrls: [LIST_ROUTES.PSI_WAREHOUSES, LIST_ROUTES.PSI_WAREHOUSE_FLOW]
      });
    } catch (submitErr) {
      wx.hideLoading();
      this.setData({ submitting: false });
      const msg = submitErr && submitErr.message || '保存失败';
      wx.showToast({
        title: msg.length > 40 ? `${msg.slice(0, 40)}…` : msg,
        icon: 'none',
        duration: 3500
      });
    }
  }
});