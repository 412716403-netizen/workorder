const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/salesOrders.js'),PSI_TYPE = _require3.PSI_TYPE;
const _require4 =




  require('../utils/salesOrders.js'),groupDocItemsByLineGroup = _require4.groupDocItemsByLineGroup,lineGroupTotalQty = _require4.lineGroupTotalQty,buildProductMap = _require4.buildProductMap,buildCategoryMap = _require4.buildCategoryMap;
const _require5 =


  require('../utils/salesOrderAllocation.js'),computeInitialAllocationQuantities = _require5.computeInitialAllocationQuantities,buildAllocationSaveRecords = _require5.buildAllocationSaveRecords;
const _require6 = require('../utils/psiAllocationDisplay.js'),effectiveAllocatedQuantity = _require6.effectiveAllocatedQuantity;
const _require7 = require('../../utils/psiOpsAggregators.js'),groupRecordsByDocNumber = _require7.groupRecordsByDocNumber;
const _require8 = require('../../utils/psiApi.js'),fetchAllPsiRecords = _require8.fetchAllPsiRecords,replacePsiRecords = _require8.replacePsiRecords;
const _require9 = require('../../utils/planApi.js'),fetchProductsAll = _require9.fetchProductsAll,fetchCategoriesAll = _require9.fetchCategoriesAll,fetchDictionaries = _require9.fetchDictionaries;
const _require0 = require('../../utils/orderApi.js'),fetchWarehousesAll = _require0.fetchWarehousesAll;
const _require1 = require('../../utils/productionPlans.js'),normalizeAppDictionaries = _require1.normalizeAppDictionaries,productHasColorSizeMatrix = _require1.productHasColorSizeMatrix;
const _require10 = require('../../utils/variantQtyMatrix.js'),buildVariantMatrixUiModel = _require10.buildVariantMatrixUiModel;
const _require11 =






  require('../../utils/matrixQtyKeyboard.js'),activateMatrixKeyboardCell = _require11.activateMatrixKeyboardCell,applyMatrixKeyboardKey = _require11.applyMatrixKeyboardKey,buildMatrixKeyboardPreview = _require11.buildMatrixKeyboardPreview,createMatrixKeyboardInputSession = _require11.createMatrixKeyboardInputSession,getNextMatrixVariantIdInColumn = _require11.getNextMatrixVariantIdInColumn,getNextMatrixVariantIdInRow = _require11.getNextMatrixVariantIdInRow;
const _require12 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require12.readNavBarMetrics,readWindowMetrics = _require12.readWindowMetrics,computePlanCreateHeaderHeight = _require12.computePlanCreateHeaderHeight;
const _require13 = require('../../utils/matrixKeyboardLayout.js'),afterMatrixKeyboardOpen = _require13.afterMatrixKeyboardOpen,handleMatrixOutsideTap = _require13.handleMatrixOutsideTap;
const _require14 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require14.LIST_ROUTES,afterSaveReturnToList = _require14.afterSaveReturnToList;

const WAREHOUSE_PREF_KEY = 'psi_sales_order_allocation_warehouse';

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
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
    matrixScrollTop: 0,
    loading: true,
    submitting: false,
    title: '配货',
    docNumber: '',
    productName: '',
    orderQtyText: '',
    allocatedText: '',
    gapText: '',
    warehouseNames: [],
    warehouseIndex: 0,
    warehouseId: '',
    useMatrix: false,
    matrixLayout: null,
    singleQty: '',
    variantQuantities: {},
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    pickerSheetOpen: false,
    ...emptyMatrixKeyboardState()
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    const lineGroupId = options.lineGroupId ? decodeURIComponent(options.lineGroupId) : '';
    if (!hasPermission(ctx && ctx.permissions || [], 'psi:sales_order_allocation:allow')) {
      wx.showToast({ title: '无配货权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._docNumber = docNumber;
    this._lineGroupId = lineGroupId;
    this._matrixKbInput = createMatrixKeyboardInputSession();
    this.setData({
      docNumber,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav)
    });
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => [])]
        ),records = _await$Promise$all[0],products = _await$Promise$all[1],categories = _await$Promise$all[2],dictionaries = _await$Promise$all[3],warehousesRaw = _await$Promise$all[4];
      const groups = groupRecordsByDocNumber(records || [], PSI_TYPE);
      const docItems = groups[this._docNumber];
      if (!docItems || !docItems.length) {
        wx.showToast({ title: '未找到订单', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const lineGroups = groupDocItemsByLineGroup(docItems);
      const grp = lineGroups[this._lineGroupId];
      if (!grp || !grp.length) {
        wx.showToast({ title: '未找到明细行', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      this._docRecords = docItems;
      this._grp = grp;
      this._deleteIds = docItems.map((r) => r.id);

      const productMap = buildProductMap(products || []);
      const categoryMap = buildCategoryMap(categories || []);
      const first = grp[0];
      const product = productMap.get(first.productId);
      const category = product ? categoryMap.get(product.categoryId) : null;
      const useMatrix = Boolean(product && productHasColorSizeMatrix(product, category));
      const dict = normalizeAppDictionaries(dictionaries);
      const whList = Array.isArray(warehousesRaw) ? warehousesRaw : warehousesRaw.data || [];
      const warehouseNames = whList.map((w) => w.name || w.id);
      const prefWh = wx.getStorageSync(WAREHOUSE_PREF_KEY) || '';
      const lineWh = first.allocationWarehouseId || '';
      const whId = lineWh || prefWh || whList[0] && whList[0].id || '';
      const whIndex = Math.max(0, whList.findIndex((w) => w.id === whId));

      const initialQty = computeInitialAllocationQuantities(grp);
      const orderTotal = lineGroupTotalQty(grp);
      const displayAllocated = grp.reduce(
        (s, i) => s + effectiveAllocatedQuantity(i.allocatedQuantity, i.shippedQuantity),
        0
      );
      const gapTotal = Math.max(0, orderTotal - displayAllocated);

      let matrixLayout = null;
      let variantQuantities = {};
      let singleQty = '';
      if (useMatrix && product) {
        if (typeof initialQty === 'object') variantQuantities = initialQty;
        matrixLayout = buildVariantMatrixUiModel(product, dict, variantQuantities);
      } else if (typeof initialQty === 'number') {
        singleQty = String(initialQty);
      }

      this._product = product;
      this._dictionaries = dict;
      this._warehouses = whList;
      this._allocationQuantities = initialQty;
      this.setData({
        loading: false,
        productName: product && product.name || first.productName || '—',
        orderQtyText: String(orderTotal),
        allocatedText: String(displayAllocated),
        gapText: String(gapTotal),
        warehouseNames,
        warehouseIndex: whIndex,
        warehouseId: whId,
        useMatrix,
        matrixLayout,
        variantQuantities,
        singleQty
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onWarehouseChange(e) {
    const idx = Number(e.detail.value) || 0;
    const wh = (this._warehouses || [])[idx];
    this.setData({
      warehouseIndex: idx,
      warehouseId: wh ? wh.id : ''
    });
  },

  onSingleQtyInput(e) {
    const v = e.detail.value || '';
    this._allocationQuantities = Number(v) || 0;
    this.setData({ singleQty: v });
  },

  onMatrixCellTap(e) {
    const variantId = e.currentTarget.dataset.variantId;
    const uiLayout = this.data.matrixLayout;
    if (!variantId || !uiLayout) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      uiLayout,
      variantId,
      this._allocationQuantities || {}
    );
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    }, () => afterMatrixKeyboardOpen(this, '.plan-create-scroll'));
  },

  onMatrixOutsideTap() {
    handleMatrixOutsideTap(this);
  },


  onMatrixKeyboardAction(e) {
    const _ref = e.detail || {},action = _ref.action,digit = _ref.digit;
    if (action === 'confirm') {
      this.setData(emptyMatrixKeyboardState());
      return;
    }
    const variantId = this.data.activeMatrixVariantId;
    const uiLayout = this.data.matrixLayout;
    if (!variantId || !uiLayout) return;

    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(uiLayout, variantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(uiLayout, nextId, this._allocationQuantities || {});
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value
        }, () => afterMatrixKeyboardOpen(this, '.plan-create-scroll'));
      } else {
        this.setData(emptyMatrixKeyboardState());
      }
      return;
    }

    if (action === 'next') {
      const nextId = getNextMatrixVariantIdInColumn(uiLayout, variantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(uiLayout, nextId, this._allocationQuantities || {});
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value
        }, () => afterMatrixKeyboardOpen(this, '.plan-create-scroll'));
      } else {
        this.setData(emptyMatrixKeyboardState());
      }
      return;
    }

    const currentRaw = (this._allocationQuantities && this._allocationQuantities[variantId]) != null ?
    String(this._allocationQuantities[variantId]) :
    '';
    const _applyMatrixKeyboardK = applyMatrixKeyboardKey(
        this._matrixKbInput,
        currentRaw,
        action,
        digit
      ),value = _applyMatrixKeyboardK.value,replaceConsumed = _applyMatrixKeyboardK.replaceConsumed;
    const parsed = value === '' ? 0 : Number(value);
    const qty = Number.isFinite(parsed) ? parsed : 0;
    this._allocationQuantities = { ...(this._allocationQuantities || {}), [variantId]: qty };
    const matrixLayout = this._product ?
    buildVariantMatrixUiModel(this._product, this._dictionaries || {}, this._allocationQuantities) :
    this.data.matrixLayout;
    this.setData({
      matrixKeyboardValue: value,
      matrixInputReplaceAll: replaceConsumed ? false : this.data.matrixInputReplaceAll,
      variantQuantities: { ...this._allocationQuantities },
      matrixLayout
    });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const warehouseId = this.data.warehouseId;
    if (!warehouseId) {
      wx.showToast({ title: '请选择仓库', icon: 'none' });
      return;
    }
    const allocationQuantities = this.data.useMatrix ?
    this._allocationQuantities || {} :
    Number(this.data.singleQty) || 0;
    const hasQty = typeof allocationQuantities === 'number' ?
    allocationQuantities > 0 :
    Object.values(allocationQuantities).some((v) => Number(v) > 0);
    if (!hasQty) {
      wx.showToast({ title: '请输入配货数量', icon: 'none' });
      return;
    }

    const newRecords = buildAllocationSaveRecords(
      this._docRecords,
      this._grp,
      allocationQuantities,
      warehouseId
    );

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中…' });
    try {
      await replacePsiRecords(this._deleteIds, newRecords);
      wx.setStorageSync(WAREHOUSE_PREF_KEY, warehouseId);
      wx.hideLoading();
      this.setData({ submitting: false });
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.PSI_SALES_ORDERS,
        toastTitle: '配货成功'
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  }
});