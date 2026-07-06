const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { PSI_TYPE } = require('../../config/salesOrders.js');
const {
  groupDocItemsByLineGroup,
  lineGroupTotalQty,
  buildProductMap,
  buildCategoryMap,
} = require('../../utils/salesOrders.js');
const {
  computeInitialAllocationQuantities,
  buildAllocationSaveRecords,
} = require('../../utils/salesOrderAllocation.js');
const { effectiveAllocatedQuantity } = require('../../utils/psiAllocationDisplay.js');
const { groupRecordsByDocNumber } = require('../../utils/psiOpsAggregators.js');
const { fetchAllPsiRecords, replacePsiRecords } = require('../../utils/psiApi.js');
const { fetchProductsAll, fetchCategoriesAll, fetchDictionaries } = require('../../utils/planApi.js');
const { fetchWarehousesAll } = require('../../utils/orderApi.js');
const { normalizeAppDictionaries, productHasColorSizeMatrix } = require('../../utils/productionPlans.js');
const { buildVariantMatrixUiModel } = require('../../utils/variantQtyMatrix.js');
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
    matrixKeyboardValue: '',
  };
}

Page({
  data: {
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
    ...emptyMatrixKeyboardState(),
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    const lineGroupId = options.lineGroupId ? decodeURIComponent(options.lineGroupId) : '';
    if (!hasPermission((ctx && ctx.permissions) || [], 'psi:sales_order_allocation:allow')) {
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
      scrollHeight: computeScrollHeight(nav),
    });
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [records, products, categories, dictionaries, warehousesRaw] = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => []),
      ]);
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
      const whList = Array.isArray(warehousesRaw) ? warehousesRaw : (warehousesRaw.data || []);
      const warehouseNames = whList.map((w) => w.name || w.id);
      const prefWh = wx.getStorageSync(WAREHOUSE_PREF_KEY) || '';
      const lineWh = first.allocationWarehouseId || '';
      const whId = lineWh || prefWh || (whList[0] && whList[0].id) || '';
      const whIndex = Math.max(0, whList.findIndex((w) => w.id === whId));

      const initialQty = computeInitialAllocationQuantities(grp);
      const orderTotal = lineGroupTotalQty(grp);
      const displayAllocated = grp.reduce(
        (s, i) => s + effectiveAllocatedQuantity(i.allocatedQuantity, i.shippedQuantity),
        0,
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
        productName: (product && product.name) || first.productName || '—',
        orderQtyText: String(orderTotal),
        allocatedText: String(displayAllocated),
        gapText: String(gapTotal),
        warehouseNames,
        warehouseIndex: whIndex,
        warehouseId: whId,
        useMatrix,
        matrixLayout,
        variantQuantities,
        singleQty,
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
      warehouseId: wh ? wh.id : '',
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
      this._allocationQuantities || {},
    );
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    }, () => afterMatrixKeyboardOpen(this, '.plan-create-scroll'));
  },

  onMatrixKeyboardAction(e) {
    const { action, digit } = e.detail || {};
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
          matrixKeyboardValue: preview.value,
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
          matrixKeyboardValue: preview.value,
        }, () => afterMatrixKeyboardOpen(this, '.plan-create-scroll'));
      } else {
        this.setData(emptyMatrixKeyboardState());
      }
      return;
    }

    const currentRaw = (this._allocationQuantities && this._allocationQuantities[variantId]) != null
      ? String(this._allocationQuantities[variantId])
      : '';
    const { value, replaceConsumed } = applyMatrixKeyboardKey(
      this._matrixKbInput,
      currentRaw,
      action,
      digit,
    );
    const parsed = value === '' ? 0 : Number(value);
    const qty = Number.isFinite(parsed) ? parsed : 0;
    this._allocationQuantities = { ...(this._allocationQuantities || {}), [variantId]: qty };
    const matrixLayout = this._product
      ? buildVariantMatrixUiModel(this._product, this._dictionaries || {}, this._allocationQuantities)
      : this.data.matrixLayout;
    this.setData({
      matrixKeyboardValue: value,
      matrixInputReplaceAll: replaceConsumed ? false : this.data.matrixInputReplaceAll,
      variantQuantities: { ...this._allocationQuantities },
      matrixLayout,
    });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const warehouseId = this.data.warehouseId;
    if (!warehouseId) {
      wx.showToast({ title: '请选择仓库', icon: 'none' });
      return;
    }
    const allocationQuantities = this.data.useMatrix
      ? (this._allocationQuantities || {})
      : (Number(this.data.singleQty) || 0);
    const hasQty = typeof allocationQuantities === 'number'
      ? allocationQuantities > 0
      : Object.values(allocationQuantities).some((v) => Number(v) > 0);
    if (!hasQty) {
      wx.showToast({ title: '请输入配货数量', icon: 'none' });
      return;
    }

    const newRecords = buildAllocationSaveRecords(
      this._docRecords,
      this._grp,
      allocationQuantities,
      warehouseId,
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
        toastTitle: '配货成功',
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },
});
