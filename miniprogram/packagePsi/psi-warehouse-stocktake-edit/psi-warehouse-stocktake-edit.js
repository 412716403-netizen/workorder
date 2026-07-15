const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx,readOperatorDisplayName = _require.readOperatorDisplayName;
const _require2 = require('../config/warehouses.js'),PSI_STOCKTAKE_TYPE = _require2.PSI_STOCKTAKE_TYPE;
const _require3 =










  require('../utils/warehouseStocktakeForm.js'),buildInitialForm = _require3.buildInitialForm,createEmptyLine = _require3.createEmptyLine,recordsToLineItems = _require3.recordsToLineItems,enrichLineForUi = _require3.enrichLineForUi,lineWillBeSaved = _require3.lineWillBeSaved,validateStocktakeSave = _require3.validateStocktakeSave,buildStocktakeSaveRecords = _require3.buildStocktakeSaveRecords,generateSTDocNumber = _require3.generateSTDocNumber,resolvePreferredStocktakeWarehouse = _require3.resolvePreferredStocktakeWarehouse,writeStocktakePreference = _require3.writeStocktakePreference,hydrateEntryDate = _require3.hydrateEntryDate;
const _require4 = require('../utils/purchaseBillBatch.js'),attachMergeBatchesToLine = _require4.attachMergeBatchesToLine;
const _require5 = require('../utils/warehouseStock.js'),buildStockSnapshotIndex = _require5.buildStockSnapshotIndex;
const _require6 = require('../../utils/purchaseOrders.js'),buildProductMap = _require6.buildProductMap,buildCategoryMap = _require6.buildCategoryMap;
const _require7 = require('../../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require7.groupRecordsByDocNumber;
const _require8 =



  require('../../utils/psiApi.js'),fetchAllPsiRecords = _require8.fetchAllPsiRecords,createPsiRecordsBatch = _require8.createPsiRecordsBatch,replacePsiRecords = _require8.replacePsiRecords;
const _require9 = require('../../utils/planApi.js'),fetchProductsAll = _require9.fetchProductsAll,fetchCategoriesAll = _require9.fetchCategoriesAll,fetchDictionaries = _require9.fetchDictionaries;
const _require0 = require('../../utils/orderApi.js'),fetchWarehousesAll = _require0.fetchWarehousesAll,fetchStockSnapshot = _require0.fetchStockSnapshot;
const _require1 = require('../../utils/productionPlans.js'),normalizeAppDictionaries = _require1.normalizeAppDictionaries,normalizeMasterList = _require1.normalizeMasterList,productHasColorSizeMatrix = _require1.productHasColorSizeMatrix;
const _require10 = require('../../utils/matrixQtyKeyboard.js'),createMatrixKeyboardInputSession = _require10.createMatrixKeyboardInputSession;
const _require11 =



  require('../utils/psiFormMatrixKeyboard.js'),emptyMatrixKeyboardState = _require11.emptyMatrixKeyboardState,handleMatrixCellTap = _require11.handleMatrixCellTap,handleMatrixKeyboardAction = _require11.handleMatrixKeyboardAction;
const _require12 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require12.readNavBarMetrics,readWindowMetrics = _require12.readWindowMetrics,computePlanCreateHeaderHeight = _require12.computePlanCreateHeaderHeight;
const _require13 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require13.LIST_ROUTES,afterSaveReturnToList = _require13.afterSaveReturnToList;

Page({
  data: {
    loading: true,
    submitting: false,
    editing: false,
    title: '登记盘点',
    form: buildInitialForm(),
    lines: [],
    products: [],
    categories: [],
    warehouses: [],
    warehouseNames: [],
    warehouseIndex: 0,
    enteredLineCount: 0,
    canSubmit: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    matrixScrollTop: 0,
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
      title: editing ? '编辑盘点' : '登记盘点',
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
      const _await$Promise$all = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => []),
        fetchAllPsiRecords(PSI_STOCKTAKE_TYPE).catch(() => [])]
        ),products = _await$Promise$all[0],categories = _await$Promise$all[1],dictionaries = _await$Promise$all[2],warehouses = _await$Promise$all[3],records = _await$Promise$all[4];
      await this.loadStockIndex();
      this._products = normalizeMasterList(products);
      this._categories = normalizeMasterList(categories);
      this._productMap = buildProductMap(this._products);
      this._categoryMap = buildCategoryMap(this._categories);
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      this._allRecords = records || [];
      const whList = Array.isArray(warehouses) ? warehouses : warehouses.data || [];
      this._warehouses = whList;
      const warehouseNames = whList.map((w) => w.name || w.id);
      const preferred = resolvePreferredStocktakeWarehouse(whList);
      let whIdx = preferred ? Math.max(0, whList.findIndex((w) => w.id === preferred.id)) : 0;
      let form = buildInitialForm();
      let lines = [createEmptyLine()];
      if (this._editingDocNumber) {
        const items = groupRecordsByDocNumber(this._allRecords, PSI_STOCKTAKE_TYPE)[this._editingDocNumber];
        if (!items || !items.length) {
          wx.showToast({ title: '未找到盘点单', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
        const first = items[0];
        whIdx = Math.max(0, whList.findIndex((w) => w.id === first.warehouseId));
        form = {
          ...form,
          warehouseId: first.warehouseId || '',
          warehouseName: whList[whIdx] && whList[whIdx].name || '',
          docNumber: this._editingDocNumber,
          note: first.note || '',
          operator: first.operator || '',
          stocktakeDate: hydrateEntryDate(first.createdAt),
        };
        lines = recordsToLineItems(items, this._productMap, this._categoryMap, this._dictionaries);
        this._deleteIds = items.map((r) => r.id);
        this._savedTimestamp = first.timestamp || new Date().toISOString();
      } else {
        const wh = whList[whIdx];
        form = {
          ...form,
          warehouseId: wh && wh.id || '',
          warehouseName: wh && wh.name || ''
        };
      }
      this._form = form;
      this._lines = lines.length ? lines : [createEmptyLine()];
      this.setData({
        loading: false,
        form,
        warehouses: whList,
        warehouseNames,
        warehouseIndex: whIdx,
        products: this._products,
        categories: this._categories
      });
      this.refreshLinesUi();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  refreshLinesUi() {
    const whId = this._form && this._form.warehouseId || '';
    const lines = (this._lines || []).map((l) => {
      const enriched = enrichLineForUi(
        l,
        this._productMap,
        this._categoryMap,
        this._dictionaries,
        this._stockIndex,
        whId
      );
      return attachMergeBatchesToLine(enriched, this._allRecords, whId);
    });
    const enteredLineCount = (this._lines || []).filter(lineWillBeSaved).length;
    this.setData({
      lines,
      form: this._form,
      enteredLineCount,
      canSubmit: enteredLineCount > 0
    });
  },

  onStocktakeDateChange(e) {
    const stocktakeDate = (e.detail && e.detail.value) || '';
    this._form = { ...this._form, stocktakeDate };
    this.setData({ form: this._form });
  },

  async onWarehouseChange(e) {
    const idx = Number(e.detail.value) || 0;
    const wh = (this._warehouses || [])[idx];
    if (!wh) return;
    this._form = { ...this._form, warehouseId: wh.id, warehouseName: wh.name || wh.id };
    writeStocktakePreference(wh.id);
    this.setData({ warehouseIndex: idx, form: this._form });
    await this.loadStockIndex();
    this.refreshLinesUi();
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
    const product = id ? this._productMap.get(id) : null;
    const category = product && this._categoryMap.get(product.categoryId);
    const useMatrix = Boolean(product && productHasColorSizeMatrix(product, category));
    this._lines = (this._lines || []).map((l) =>
    l.id === lineId ?
    {
      ...l,
      productId: id || '',
      productName: name || '',
      variantQuantities: {},
      quantity: '',
      batch: '',
      useMatrix
    } :
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

  onMatrixKeyboardAction(e) {
    handleMatrixKeyboardAction(this, e, { onLinesUpdated: () => this.refreshLinesUi() });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const err = validateStocktakeSave(this._form, this._lines, this._productMap, this._categoryMap);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const docNumber = this._form.docNumber ||
    this._editingDocNumber ||
    generateSTDocNumber(this._allRecords || []);
    if (!docNumber) {
      wx.showToast({ title: '生成单号失败', icon: 'none' });
      return;
    }
    this._form.docNumber = docNumber;
    const operator = readOperatorDisplayName();
    const timestamp = this._savedTimestamp || new Date().toISOString();
    const newRecords = buildStocktakeSaveRecords(
      this._form,
      this._lines,
      this._productMap,
      this._categoryMap,
      this._stockIndex,
      docNumber,
      timestamp,
      operator,
      this._editingDocNumber
    );
    if (!newRecords.length) {
      wx.showToast({ title: '请录入盘点数量', icon: 'none' });
      return;
    }
    writeStocktakePreference(this._form.warehouseId);
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
        listUrl: LIST_ROUTES.PSI_WAREHOUSE_STOCKTAKE,
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