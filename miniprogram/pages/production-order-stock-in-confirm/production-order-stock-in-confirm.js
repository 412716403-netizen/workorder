const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  fetchTenantConfig,
  fetchWarehousesAll,
  fetchProductsAll,
  fetchCategoriesAll,
  createProductionRecordBatch,
} = require('../../utils/orderApi.js');
const { fetchDictionaries } = require('../../utils/planApi.js');
const {
  loadPendingStockRows,
  fetchAllOrdersPaginated,
  fetchStockInRecordsForScope,
} = require('../../utils/pendingStockBadge.js');
const {
  normalizeMasterList,
  normalizeAppDictionaries,
} = require('../../utils/productionPlans.js');
const { getProductUnitName } = require('../../utils/planFormCustomField.js');
const { buildSingleStockInRecords } = require('../../utils/stockInRecordBuilders.js');
const {
  resolvePreferredWarehouse,
  writeWarehousePreference,
  buildStockInMatrixLayout,
  patchStockInMatrixLayout,
  resolveStockInFormMode,
  sumVariantQtyMap,
  validateStockInQty,
  buildBatchLineViewModels,
  buildStockInFormDefaultsForPending,
  buildPendingStockItem,
  expandPendingByVariantForMatrix,
} = require('../../utils/stockInForm.js');
const {
  applyMatrixKeyPress,
  buildMatrixKeyboardPreview,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function parseRowKeys(raw) {
  if (!raw) return [];
  return String(raw).split(',').map((s) => decodeURIComponent(s.trim())).filter(Boolean);
}

Page({
  data: {
    loading: true,
    submitting: false,
    mode: 'single',
    pageTitle: '确认入库',
    unitName: '件',
    formMode: 'single',
    matrixLayout: null,
    batchLines: [],
    singleQuantity: '0',
    warehouseNames: [],
    warehousePickerIndex: 0,
    warehouseId: '',
    warehouseName: '',
    pendingTotal: 0,
    summaryTitle: '',
    summaryMeta: '',
    matrixKeyboardVisible: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  _quantities: {},
  _batchLineForms: {},

  onLoad(options) {
    const nav = readNavBarMetrics();
    const mode = options.mode === 'batch' ? 'batch' : 'single';
    this._rowKeys = parseRowKeys(options.rowKeys ? decodeURIComponent(options.rowKeys) : '');
    this._activeRowKey = mode === 'single' && this._rowKeys[0] ? this._rowKeys[0] : '';

    const ctx = readTenantCtx();
    if (!hasPermission((ctx && ctx.permissions) || [], 'production:orders_pending_stock_in:create')) {
      wx.showToast({ title: '无入库权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this.setData({
      mode,
      pageTitle: mode === 'batch' ? '批量入库' : '确认入库',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });

    if (!this._rowKeys.length) {
      wx.showToast({ title: '参数不完整', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [
        config,
        warehousesRaw,
        productsRaw,
        categoriesRaw,
        dictionariesRaw,
        pendingRows,
        allOrders,
      ] = await Promise.all([
        fetchTenantConfig(),
        fetchWarehousesAll(),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchDictionaries(),
        loadPendingStockRows(),
        fetchAllOrdersPaginated({}),
      ]);

      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const allowExceedMaxStockInQty = !!(config && config.allowExceedMaxStockInQty);
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);
      const warehouses = Array.isArray(warehousesRaw) ? warehousesRaw : (warehousesRaw.data || []);
      const selectedRows = pendingRows.filter((r) =>
        this._rowKeys.includes(r.rowKey) || this._rowKeys.includes(r.orderId),
      );
      if (!selectedRows.length) {
        wx.showToast({ title: '待入库项已变化', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      const orderIds = allOrders.map((o) => o.id).filter(Boolean);
      const productIds = [...new Set(allOrders.map((o) => o.productId).filter(Boolean))];
      const prodRecords = await fetchStockInRecordsForScope(orderIds, productIds);

      const prefKind = this.data.mode === 'batch' ? 'batch' : 'single';
      const wh = resolvePreferredWarehouse(warehouses, prefKind);
      const warehouseNames = warehouses.map((w) => w.name || w.code || w.id);

      this._config = config;
      this._productionLinkMode = productionLinkMode;
      this._allowExceed = allowExceedMaxStockInQty;
      this._prodRecords = prodRecords;
      this._allOrders = allOrders;
      this._products = products;
      this._categories = categories;
      this._dictionaries = dictionaries;
      this._warehouses = warehouses;
      this._selectedRows = selectedRows;
      this._quantities = {};
      this._batchLineForms = {};

      if (this.data.mode === 'batch') {
        selectedRows.forEach((row) => {
          const order = allOrders.find((o) => o.id === row.orderId);
          const ordersInRow = productionLinkMode === 'product'
            ? allOrders.filter((o) => o.productId === row.rowKey)
            : (order ? [order] : []);
          const product = products.find((p) => p.id === (order && order.productId));
          const category = product && product.categoryId
            ? categories.find((c) => c.id === product.categoryId)
            : null;
          const pendingItem = buildPendingStockItem(row, order, ordersInRow);
          const defaults = buildStockInFormDefaultsForPending(pendingItem, product, category);
          this._batchLineForms[row.rowKey] = {
            singleQuantity: defaults.singleQuantity || row.pendingTotal || 0,
            variantQuantities: defaults.variantQuantities,
          };
        });
        const batchLines = buildBatchLineViewModels(selectedRows, this._batchLineForms, '件');
        this.setData({
          loading: false,
          batchLines,
          warehouseNames,
          warehousePickerIndex: Math.max(0, warehouses.findIndex((w) => w.id === (wh && wh.id))),
          warehouseId: wh ? wh.id : '',
          warehouseName: wh ? (wh.name || '') : '',
          pendingTotal: selectedRows.reduce((s, r) => s + (r.pendingTotal || 0), 0),
          summaryTitle: `共 ${selectedRows.length} 项`,
          summaryMeta: `合计待入库 ${selectedRows.reduce((s, r) => s + (r.pendingTotal || 0), 0)} 件`,
        });
        return;
      }

      const row = selectedRows[0];
      const order = allOrders.find((o) => o.id === row.orderId) || allOrders.find((o) => o.id === row.rowKey);
      const product = products.find((p) => p.id === (order && order.productId));
      const category = product && product.categoryId
        ? categories.find((c) => c.id === product.categoryId)
        : null;
      const unitName = getProductUnitName(product, dictionaries);
      const ordersInRow = productionLinkMode === 'product'
        ? allOrders.filter((o) => o.productId === row.rowKey)
        : (order ? [order] : []);

      this._activeRow = row;
      this._order = order || ordersInRow[0];
      this._ordersInRow = ordersInRow;
      this._product = product;
      this._category = category;

      const pendingItem = buildPendingStockItem(row, this._order, ordersInRow);
      this._pendingCaps = expandPendingByVariantForMatrix(pendingItem, product, category);
      const defaults = buildStockInFormDefaultsForPending(pendingItem, product, category);
      this._quantities = {};
      Object.entries(defaults.variantQuantities || {}).forEach(([vid, qty]) => {
        if ((Number(qty) || 0) > 0) this._quantities[vid] = String(qty);
      });

      const formMode = resolveStockInFormMode(product, category, row.pendingByVariant);
      let matrixLayout = null;
      if (formMode === 'matrix' && product) {
        matrixLayout = buildStockInMatrixLayout(
          product,
          dictionaries,
          this._quantities,
          this._pendingCaps,
          allowExceedMaxStockInQty,
        );
      }

      const singleQuantity = defaults.singleQuantity > 0
        ? String(defaults.singleQuantity)
        : (row.pendingTotal > 0 ? String(row.pendingTotal) : '0');
      this.setData({
        loading: false,
        formMode,
        matrixLayout,
        singleQuantity,
        unitName,
        warehouseNames,
        warehousePickerIndex: Math.max(0, warehouses.findIndex((w) => w.id === (wh && wh.id))),
        warehouseId: wh ? wh.id : '',
        warehouseName: wh ? (wh.name || '') : '',
        pendingTotal: row.pendingTotal || 0,
        summaryTitle: productionLinkMode === 'product' ? (row.productName || '') : (row.orderNumber || ''),
        summaryMeta: `待入库 ${row.pendingTotal || 0} ${unitName} · 已入库 ${row.alreadyIn || 0}`,
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },

  onWarehouseChange(e) {
    const idx = Number(e.detail.value) || 0;
    const wh = (this._warehouses || [])[idx];
    if (!wh) return;
    this.setData({
      warehousePickerIndex: idx,
      warehouseId: wh.id,
      warehouseName: wh.name || wh.code || '',
    });
  },

  onSingleQtyInput(e) {
    this.setData({ singleQuantity: e.detail.value || '' });
  },

  onBatchLineInput(e) {
    const { rowKey } = e.currentTarget.dataset;
    if (!rowKey) return;
    const val = e.detail.value || '';
    if (!this._batchLineForms[rowKey]) {
      this._batchLineForms[rowKey] = { singleQuantity: 0, variantQuantities: {} };
    }
    this._batchLineForms[rowKey].singleQuantity = val;
    this.setData({
      batchLines: buildBatchLineViewModels(this._selectedRows, this._batchLineForms, this.data.unitName),
    });
  },

  rebuildMatrixLayout() {
    if (!this._product || !this._activeRow) return;
    const pendingCaps = this._pendingCaps || this._activeRow.pendingByVariant || {};
    const matrixLayout = patchStockInMatrixLayout(
      this.data.matrixLayout,
      this._quantities,
      pendingCaps,
      this._allowExceed,
    ) || buildStockInMatrixLayout(
      this._product,
      this._dictionaries,
      this._quantities,
      pendingCaps,
      this._allowExceed,
    );
    const patch = { matrixLayout };
    if (this.data.activeMatrixVariantId) {
      const preview = buildMatrixKeyboardPreview(matrixLayout, this.data.activeMatrixVariantId, this._quantities);
      patch.matrixKeyboardLabel = preview.label;
      patch.matrixKeyboardValue = preview.value;
    }
    this.setData(patch);
  },

  onMatrixCellTap(e) {
    const { variantId } = e.currentTarget.dataset;
    if (!variantId) return;
    const preview = buildMatrixKeyboardPreview(this.data.matrixLayout, variantId, this._quantities);
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
      this.setData({
        matrixKeyboardVisible: false,
        activeMatrixVariantId: '',
        matrixKeyboardLabel: '',
        matrixKeyboardValue: '',
      });
      return;
    }
    const { activeMatrixVariantId, matrixLayout } = this.data;
    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(matrixLayout, activeMatrixVariantId);
      if (nextId) {
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, this._quantities);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        });
      } else {
        this.setData({
          matrixKeyboardVisible: false,
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: '',
        });
      }
      return;
    }
    if (!activeMatrixVariantId) return;
    const current = this._quantities[activeMatrixVariantId] || '';
    this._quantities[activeMatrixVariantId] = applyMatrixKeyPress(current, action, digit);
    this.rebuildMatrixLayout();
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const whId = this.data.warehouseId;
    const whName = this.data.warehouseName;
    if (!whId) {
      wx.showToast({ title: '请选择仓库', icon: 'none' });
      return;
    }

    const operator = readOperatorDisplayName();
    const timestamp = new Date().toISOString();
    const prefKind = this.data.mode === 'batch' ? 'batch' : 'single';
    writeWarehousePreference(prefKind, whId);

    const allRecords = [];

    if (this.data.mode === 'batch') {
      for (let i = 0; i < (this._selectedRows || []).length; i += 1) {
        const row = this._selectedRows[i];
        const form = this._batchLineForms[row.rowKey] || {};
        const qty = Number(form.singleQuantity) || 0;
        if (qty <= 0) continue;
        if (!this._allowExceed && row.pendingTotal > 0 && qty > row.pendingTotal) {
          wx.showToast({ title: `${row.orderNumber || row.productName} 最多入库 ${row.pendingTotal}`, icon: 'none' });
          return;
        }
        const order = this._allOrders.find((o) => o.id === row.orderId);
        const ordersInRow = this._productionLinkMode === 'product'
          ? this._allOrders.filter((o) => o.productId === row.rowKey)
          : (order ? [order] : []);
        const product = this._products.find((p) => p.id === (order && order.productId));
        const recs = buildSingleStockInRecords({
          order: order || ordersInRow[0],
          ordersInRow,
          productionLinkMode: this._productionLinkMode,
          hasColorSize: false,
          hasVariants: false,
          variantQuantities: {},
          singleQuantity: qty,
          warehouseId: whId,
          customData: {},
          operator,
          timestamp,
          prodRecords: this._prodRecords,
        });
        allRecords.push(...recs);
      }
      if (!allRecords.length) {
        wx.showToast({ title: '请填写入库数量', icon: 'none' });
        return;
      }
    } else {
      const row = this._activeRow;
      const pendingCaps = this._pendingCaps || row.pendingByVariant || {};
      const err = validateStockInQty(
        this.data.formMode,
        this._quantities,
        this.data.singleQuantity,
        row.pendingTotal,
        pendingCaps,
        this._allowExceed,
        this.data.unitName,
      );
      if (err) {
        wx.showToast({ title: err, icon: 'none' });
        return;
      }
      const hasVariants = !!(this._product && this._product.variants && this._product.variants.length);
      const hasColorSize = this.data.formMode === 'matrix';
      const recs = buildSingleStockInRecords({
        order: this._order,
        ordersInRow: this._ordersInRow,
        productionLinkMode: this._productionLinkMode,
        hasColorSize,
        hasVariants,
        variantQuantities: this._quantities,
        singleQuantity: Number(this.data.singleQuantity) || 0,
        warehouseId: whId,
        customData: {},
        operator,
        timestamp,
        prodRecords: this._prodRecords,
      });
      allRecords.push(...recs);
      if (!allRecords.length) {
        wx.showToast({ title: '请填写入库数量', icon: 'none' });
        return;
      }
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      await createProductionRecordBatch(allRecords);
      wx.showToast({ title: '入库成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 400);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '入库失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
