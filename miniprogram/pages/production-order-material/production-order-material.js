const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  getOrder,
  listOrdersPaginated,
  fetchBomsAll,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchProductionRecords,
  createProductionRecordBatch,
  fetchWarehousesAll,
  fetchNodesAll,
  fetchStockBatches,
} = require('../../utils/orderApi.js');
const {
  buildBomMaterialsForOrder,
  buildBomMaterialsForProductGroup,
  buildIssuedMapForOrder,
  buildIssuedMapForProduct,
  buildMaterialIssueUiRows,
} = require('../../utils/orderMaterialLite.js');
const {
  decorateRowsWithBatchFlags,
  attachBatchOptionsToRows,
  applyBatchSelection,
  rowsNeedBatchColumn,
  validateMaterialIssueBatchRows,
} = require('../../utils/materialIssueBatch.js');
const {
  buildProductionRecordBatchPayload,
  parseBatchErrorMessage,
} = require('../../utils/materialStockConfirm.js');
const { normalizeMasterList } = require('../../utils/productionOrders.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

async function fetchOrdersByProductId(productId) {
  const pageSize = 200;
  let page = 1;
  let total = Infinity;
  const all = [];
  while (all.length < total) {
    const result = await listOrdersPaginated({ page, pageSize, productId });
    const batch = result.data || [];
    all.push(...batch);
    total = typeof result.total === 'number' ? result.total : all.length;
    if (!batch.length || batch.length < pageSize) break;
    page += 1;
    if (page > 40) break;
  }
  return all;
}

Page({
  data: {
    loading: true,
    submitting: false,
    canMaterial: false,
    scopeMode: 'order',
    orderNumber: '',
    productName: '',
    productSku: '',
    showProductSku: false,
    showOrderNumber: false,
    rows: [],
    hasRows: false,
    showBatchCol: false,
    canSubmit: false,
    warehouseNames: [],
    warehouseIndex: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });

    const ctx = readTenantCtx();
    this.setData({
      canMaterial: hasPermission((ctx && ctx.permissions) || [], 'production:orders_material:allow'),
    });

    this._orderId = options.orderId ? decodeURIComponent(options.orderId) : '';
    this._productId = options.productId ? decodeURIComponent(options.productId) : '';

    if (!this._orderId && !this._productId) {
      wx.showToast({ title: '缺少工单或产品参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._scopeMode = this._productId ? 'product' : 'order';
    this.setData({ scopeMode: this._scopeMode });
    this.loadData();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onProductHeroTap() {
    const lines = [];
    if (this.data.showOrderNumber && this.data.orderNumber) {
      lines.push(`工单：${this.data.orderNumber}`);
    }
    lines.push(`产品：${this.data.productName || '—'}`);
    if (this.data.showProductSku && this.data.productSku) {
      lines.push(`编号：${this.data.productSku}`);
    }
    wx.showModal({
      title: '产品信息',
      content: lines.join('\n'),
      showCancel: false,
      confirmText: '知道了',
    });
  },

  onMaterialNameTap(e) {
    const { id } = e.currentTarget.dataset;
    const row = (this.data.rows || []).find((r) => r.materialProductId === id);
    if (!row) return;
    const lines = [`名称：${row.name || '—'}`];
    if (row.sku) lines.push(`编号：${row.sku}`);
    if (row.nodeNames && row.nodeNames.length) {
      lines.push(`工序：${row.nodeNames.join('、')}`);
    }
    wx.showModal({
      title: '物料信息',
      content: lines.join('\n'),
      showCancel: false,
      confirmText: '知道了',
    });
  },

  onIssueQtyInput(e) {
    const { id } = e.currentTarget.dataset;
    const val = e.detail.value || '';
    const rows = (this.data.rows || []).map((r) =>
      (r.materialProductId === id ? { ...r, issueQty: val } : r),
    );
    this.syncRows(rows);
  },

  onBatchChange(e) {
    const { id } = e.currentTarget.dataset;
    const idx = Number(e.detail.value);
    const rows = (this.data.rows || []).map((r) => {
      if (r.materialProductId !== id) return r;
      return applyBatchSelection(r, idx);
    });
    this.syncRows(rows);
  },

  syncRows(rows) {
    const canSubmit = (rows || []).some((r) => {
      const qty = Number(r.issueQty);
      return Number.isFinite(qty) && qty > 0;
    });
    this.setData({
      rows,
      hasRows: rows.length > 0,
      canSubmit: canSubmit && this.data.canMaterial,
    });
  },

  async refreshBatchOptions(rows, warehouse) {
    const wh = warehouse || this._selectedWarehouse;
    const withOptions = await attachBatchOptionsToRows(
      rows || this.data.rows || [],
      wh ? wh.id : '',
      fetchStockBatches,
    );
    this.syncRows(withOptions);
  },

  async onWarehouseChange(e) {
    const idx = Number(e.detail.value);
    if (!Number.isFinite(idx)) return;
    const warehouses = this._warehouses || [];
    const warehouse = warehouses[idx] || null;
    this.setData({ warehouseIndex: idx });
    this._selectedWarehouse = warehouse;
    await this.refreshBatchOptions(this.data.rows, warehouse);
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [
        bomsRaw,
        productsRaw,
        categoriesRaw,
        warehousesRaw,
        nodesRaw,
      ] = await Promise.all([
        fetchBomsAll(),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchWarehousesAll(),
        fetchNodesAll(),
      ]);

      const boms = Array.isArray(bomsRaw) ? bomsRaw : normalizeMasterList(bomsRaw);
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      this._productsById = new Map(products.map((p) => [p.id, p]));
      this._categoryById = new Map(categories.map((c) => [c.id, c]));
      const globalNodes = normalizeMasterList(nodesRaw);
      const whList = Array.isArray(warehousesRaw) ? warehousesRaw : (warehousesRaw.data || []);
      this._warehouses = whList;
      this._selectedWarehouse = whList[0] || null;

      let bomMaterials = [];
      let issuedMap = new Map();
      let orderNumber = '';
      let productName = '—';
      let productSku = '';
      let showProductSku = false;
      let showOrderNumber = false;

      if (this._scopeMode === 'product') {
        const groupOrders = await fetchOrdersByProductId(this._productId);
        this._groupOrders = groupOrders;
        const product = this._productsById.get(this._productId);
        productName = (product && product.name) || groupOrders[0]?.productName || '—';
        productSku = (product && product.sku) || groupOrders[0]?.sku || '';
        showProductSku = Boolean(productSku && productName);

        const recordsRaw = await fetchProductionRecords({
          types: 'STOCK_OUT,STOCK_RETURN',
          sourceProductIds: this._productId,
          orderIds: groupOrders.map((o) => o.id).join(','),
        });
        const records = Array.isArray(recordsRaw) ? recordsRaw : (recordsRaw.data || []);

        bomMaterials = buildBomMaterialsForProductGroup(
          groupOrders,
          this._productId,
          products,
          boms,
          globalNodes,
        );
        issuedMap = buildIssuedMapForProduct(records, groupOrders, this._productId);
        this._sourceProductId = this._productId;
        this._order = null;
      } else {
        const order = await getOrder(this._orderId);
        this._order = order;
        const product = this._productsById.get(order.productId);
        orderNumber = order.orderNumber || '';
        productName = (product && product.name) || order.productName || '—';
        productSku = (product && product.sku) || order.sku || '';
        showProductSku = Boolean(productSku && productName);
        showOrderNumber = Boolean(orderNumber);

        const recordsRaw = await fetchProductionRecords({
          types: 'STOCK_OUT,STOCK_RETURN',
          orderIds: this._orderId,
        });
        const records = Array.isArray(recordsRaw) ? recordsRaw : (recordsRaw.data || []);

        bomMaterials = buildBomMaterialsForOrder(order, products, boms, globalNodes);
        issuedMap = buildIssuedMapForOrder(records, order.id);
        this._sourceProductId = order.productId || '';
      }

      let rows = buildMaterialIssueUiRows(bomMaterials, issuedMap);
      rows = decorateRowsWithBatchFlags(rows, this._productsById, this._categoryById);
      const showBatchCol = rowsNeedBatchColumn(rows, this._productsById, this._categoryById);
      rows = await attachBatchOptionsToRows(
        rows,
        this._selectedWarehouse ? this._selectedWarehouse.id : '',
        fetchStockBatches,
      );

      const warehouseNames = whList.map((w) => {
        const code = w.code ? ` (${w.code})` : '';
        return `${w.name || w.id}${code}`;
      });

      this.setData({
        loading: false,
        orderNumber,
        productName,
        productSku,
        showProductSku,
        showOrderNumber,
        showBatchCol,
        warehouseNames,
        warehouseIndex: 0,
      });
      this.syncRows(rows);
    } catch {
      this.setData({
        loading: false,
        rows: [],
        hasRows: false,
        canSubmit: false,
        showBatchCol: false,
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async onSubmitTap() {
    if (!this.data.canMaterial || this.data.submitting) return;

    const warehouse = this._selectedWarehouse || (this._warehouses && this._warehouses[0]);
    if (!warehouse) {
      wx.showToast({ title: '暂无可用仓库', icon: 'none' });
      return;
    }

    const activeRows = (this.data.rows || []).filter((row) => {
      const qty = Number(row.issueQty);
      return Number.isFinite(qty) && qty > 0;
    });

    if (!activeRows.length) {
      wx.showToast({ title: '请填写本次领料数量', icon: 'none' });
      return;
    }

    const batchErrors = validateMaterialIssueBatchRows(activeRows);
    if (batchErrors.length) {
      wx.showToast({ title: batchErrors[0], icon: 'none' });
      return;
    }

    const selected = activeRows.map((row) => ({
      productId: row.materialProductId,
      name: row.name,
      quantity: row.issueQty,
      batchNo: row.batchNo || '',
    }));

    const payload = buildProductionRecordBatchPayload({
      mode: 'stock_out',
      rows: selected,
      orderId: this._scopeMode === 'order' ? this._order.id : undefined,
      sourceProductId: this._sourceProductId || undefined,
      warehouse,
      operator: readOperatorDisplayName(),
    });

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      await createProductionRecordBatch(payload);
      wx.showToast({ title: '领料成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 400);
    } catch (err) {
      wx.showToast({ title: parseBatchErrorMessage(err), icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
