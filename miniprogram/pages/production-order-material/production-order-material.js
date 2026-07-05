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
  fetchTenantConfig,
} = require('../../utils/orderApi.js');
const {
  buildBomMaterialsForOrder,
  buildBomMaterialsForProductGroup,
  buildIssuedMapForOrder,
  buildIssuedMapForProduct,
  buildReworkIssuedMapForOrder,
  buildReworkIssuedMapForProduct,
  buildMaterialIssueUiRows,
  buildReworkMaterialIssueUiRows,
} = require('../../utils/orderMaterialLite.js');
const {
  decorateRowsWithBatchFlags,
  attachBatchOptionsToRows,
  attachReturnBatchOptionsToRows,
  applyBatchSelection,
  rowsNeedBatchColumn,
  validateMaterialIssueBatchRows,
  validateReturnBatchRows,
} = require('../../utils/materialIssueBatch.js');
const {
  buildProductionRecordBatchPayload,
  parseBatchErrorMessage,
} = require('../../utils/materialStockConfirm.js');
const {
  computeOutsourceReturnMaterials,
  buildOutsourceReturnUiRows,
  buildInternalReturnUiRows,
  pickPreferredReturnWarehouse,
  validateReturnRows,
  buildReturnDispatchedBatchesMap,
} = require('../../utils/orderMaterialReturnLite.js');
const { normalizeMasterList } = require('../../utils/productionOrders.js');
const { buildPartnerIssuedMap } = require('../../utils/outsourceMaterialLite.js');
const { INTERNAL_PARTNER_KEY } = require('../../utils/materialStatsLite.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');

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

function applyPageLabels(page, opts) {
  const {
    isReturn,
    isOutsource,
    isMaterialCenter,
    isRework,
  } = opts;
  if (isRework) {
    page.setData({
      isReturnMode: false,
      returnLayout: '',
      warehouseLabel: '出库仓库',
      pageTitle: '返工领料',
      progressColLabel: '累计领料',
      inputColLabel: '本次领料',
      submitLabel: '确认返工领料',
      emptyText: '该工单未配置 BOM 物料，无法进行返工领料',
      showPartner: false,
    });
    return;
  }
  if (isReturn) {
    page.setData({
      isReturnMode: true,
      returnLayout: isOutsource ? 'outsource' : 'internal',
      warehouseLabel: '退回仓库',
      pageTitle: isOutsource ? '外协退料' : '生产退料',
      inputColLabel: '本次退料',
      submitLabel: isOutsource ? '确认外协退料' : '确认退料',
      emptyText: isOutsource ? '暂无可退的外协物料' : '暂无可退物料',
      showPartner: isOutsource && !!page._partnerKey,
    });
    if (isMaterialCenter && page._partnerKey && page._partnerKey !== INTERNAL_PARTNER_KEY) {
      page.setData({ showPartner: true });
    }
    return;
  }
  page.setData({
    isReturnMode: false,
    returnLayout: '',
    warehouseLabel: '出库仓库',
    pageTitle: isOutsource ? '外协领料' : (isMaterialCenter ? '物料发出' : '物料发出'),
    progressColLabel: '领料进度',
    inputColLabel: '本次领料',
    submitLabel: isOutsource ? '确认外协领料' : '确认领料发出',
    emptyText: '该工单未配置 BOM 物料，无法进行物料发出',
    showPartner: isOutsource && !!page._partnerKey,
  });
}

Page({
  data: {
    loading: true,
    submitting: false,
    canMaterial: false,
    isReturnMode: false,
    returnLayout: '',
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
    warehouseLabel: '出库仓库',
    pageTitle: '物料发出',
    progressColLabel: '领料进度',
    inputColLabel: '本次领料',
    submitLabel: '确认领料发出',
    emptyText: '该工单未配置 BOM 物料，无法进行物料发出',
    partnerLabel: '',
    showPartner: false,
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
    const perms = (ctx && ctx.permissions) || [];
    this._source = options.source ? decodeURIComponent(options.source) : '';
    this._isOutsource = this._source === 'outsource';
    this._isRework = this._source === 'rework';
    this._isMaterialCenter = this._source === 'material_center';
    this._isReturn = options.mode === 'return';
    this._partnerKey = options.partner ? decodeURIComponent(options.partner) : '';
    this._productionLinkMode = 'order';

    const prefill = (getApp().globalData && getApp().globalData.materialReturnPrefill) || null;
    if (this._isMaterialCenter && prefill) {
      this._returnPrefill = prefill;
      if (getApp().globalData) getApp().globalData.materialReturnPrefill = null;
      if (!this._partnerKey && prefill.partnerKey && prefill.partnerKey !== INTERNAL_PARTNER_KEY) {
        this._partnerKey = prefill.partnerKey;
      }
    }

    if (this._isOutsource && !this._partnerKey) {
      wx.showToast({ title: '缺少加工厂', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    let canMaterial = false;
    if (this._isReturn) {
      if (this._isOutsource) {
        canMaterial = hasPermission(perms, 'production:outsource_material:allow');
      } else {
        canMaterial = hasPermission(perms, 'production:material_return:allow');
      }
    } else if (this._isOutsource) {
      canMaterial = hasPermission(perms, 'production:outsource_material:allow');
    } else if (this._isRework) {
      canMaterial = hasPermission(perms, 'production:rework_material:allow');
    } else {
      canMaterial = hasPermission(perms, 'production:orders_material:allow')
        || hasPermission(perms, 'production:material_issue:allow');
    }

    this.setData({
      canMaterial,
      partnerLabel: this._partnerKey,
      showPartner: (this._isOutsource || this._isMaterialCenter) && !!this._partnerKey
        && this._partnerKey !== INTERNAL_PARTNER_KEY,
    });
    applyPageLabels(this, {
      isReturn: this._isReturn,
      isOutsource: this._isOutsource,
      isMaterialCenter: this._isMaterialCenter,
      isRework: this._isRework,
    });

    this._orderId = options.orderId ? decodeURIComponent(options.orderId) : '';
    this._productId = options.productId ? decodeURIComponent(options.productId) : '';

    if (this._returnPrefill) {
      this._orderId = this._returnPrefill.orderId || this._orderId;
      this._productId = this._returnPrefill.sourceProductId || this._productId;
    }

    if (!this._orderId && !this._productId) {
      wx.showToast({ title: '缺少工单或产品参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._scopeMode = this._orderId ? 'order' : 'product';
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
    let withOptions = rows || this.data.rows || [];
    if (this._isReturn) {
      withOptions = attachReturnBatchOptionsToRows(withOptions, this._returnDispatchedByProduct);
    } else {
      const wh = warehouse || this._selectedWarehouse;
      withOptions = await attachBatchOptionsToRows(
        withOptions,
        wh ? wh.id : '',
        fetchStockBatches,
      );
    }
    this.syncRows(withOptions);
  },

  async onWarehouseChange(e) {
    const idx = Number(e.detail.value);
    if (!Number.isFinite(idx)) return;
    const warehouses = this._warehouses || [];
    const warehouse = warehouses[idx] || null;
    this.setData({ warehouseIndex: idx });
    this._selectedWarehouse = warehouse;
    if (!this._isReturn) {
      await this.refreshBatchOptions(this.data.rows, warehouse);
    }
  },

  async loadReturnData(context) {
    const {
      boms,
      products,
      whList,
      globalNodes,
      orderNumber,
      productName,
      productSku,
      showProductSku,
      showOrderNumber,
      stockRecords,
      outsourceRecords,
      orders,
    } = context;

    let rows = [];
    let warehouseIndex = 0;

    if (this._returnPrefill) {
      rows = buildInternalReturnUiRows(
        this._returnPrefill.materialRows || [],
        this._returnPrefill.selectedProductIds,
      );
      this._sourceProductId = this._returnPrefill.sourceProductId || this._productId || '';
      this._order = this._returnPrefill.orderId
        ? { id: this._returnPrefill.orderId }
        : null;
      this._returnDispatchedByProduct = buildReturnDispatchedBatchesMap({
        records: stockRecords,
        orderId: this._returnPrefill.orderId || '',
        sourceProductId: this._returnPrefill.sourceProductId || '',
        orders,
        partnerKey: this._partnerKey || INTERNAL_PARTNER_KEY,
      });
    } else if (this._isOutsource) {
      const materials = computeOutsourceReturnMaterials({
        productionLinkMode: this._productionLinkMode,
        orderId: this._orderId,
        productId: this._productId,
        partnerKey: this._partnerKey,
        orders,
        products,
        boms,
        stockRecords,
        outsourceRecords,
      });
      rows = buildOutsourceReturnUiRows(materials);
      this._returnDispatchedByProduct = buildReturnDispatchedBatchesMap({
        records: stockRecords,
        orderId: this._orderId || '',
        sourceProductId: this._scopeMode === 'product' ? this._productId : (this._sourceProductId || ''),
        orders,
        partnerKey: this._partnerKey,
      });
      warehouseIndex = pickPreferredReturnWarehouse({
        stockRecords,
        productionLinkMode: this._productionLinkMode,
        orderId: this._orderId,
        productId: this._productId,
        partnerKey: this._partnerKey,
        orders,
        warehouses: whList,
      });
      if (this._scopeMode === 'product') {
        this._sourceProductId = this._productId;
      } else if (this._order) {
        this._sourceProductId = this._order.productId || '';
      }
    } else {
      rows = [];
    }

    rows = decorateRowsWithBatchFlags(rows, this._productsById, this._categoryById);
    const showBatchCol = rowsNeedBatchColumn(rows, this._productsById, this._categoryById);
    rows = attachReturnBatchOptionsToRows(rows, this._returnDispatchedByProduct);

    this._selectedWarehouse = whList[warehouseIndex] || whList[0] || null;

    const warehouseNames = whList.map((w) => {
      const code = w.code ? ` (${w.code})` : '';
      return `${w.name || w.id}${code}`;
    });

    this.setData({
      loading: false,
      orderNumber: this._returnPrefill ? (this._returnPrefill.orderNumber || orderNumber) : orderNumber,
      productName: this._returnPrefill ? (this._returnPrefill.productName || productName) : productName,
      productSku,
      showProductSku,
      showOrderNumber,
      showBatchCol,
      warehouseNames,
      warehouseIndex,
    });
    this.syncRows(rows);
  },

  async loadIssueData(context) {
    const {
      boms,
      products,
      whList,
      globalNodes,
    } = context;

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
      if (this._isOutsource) {
        const orderIds = new Set(groupOrders.map((o) => o.id));
        issuedMap = buildPartnerIssuedMap(records, {
          sourceProductId: this._productId,
          orderIds,
        }, this._partnerKey);
      } else if (this._isRework) {
        issuedMap = buildReworkIssuedMapForProduct(records, groupOrders, this._productId);
      } else {
        issuedMap = buildIssuedMapForProduct(records, groupOrders, this._productId);
      }
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
      if (this._isOutsource) {
        const orderIds = new Set([order.id]);
        issuedMap = buildPartnerIssuedMap(records, {
          orderId: order.id,
          sourceProductId: order.productId || '',
          orderIds,
        }, this._partnerKey);
      } else if (this._isRework) {
        issuedMap = buildReworkIssuedMapForOrder(records, order.id);
      } else {
        issuedMap = buildIssuedMapForOrder(records, order.id);
      }
      this._sourceProductId = order.productId || '';
    }

    let rows = this._isRework
      ? buildReworkMaterialIssueUiRows(bomMaterials, issuedMap)
      : buildMaterialIssueUiRows(bomMaterials, issuedMap);
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
        configRaw,
      ] = await Promise.all([
        fetchBomsAll(),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchWarehousesAll(),
        fetchNodesAll(),
        this._isReturn && this._isOutsource
          ? fetchTenantConfig().catch(() => ({}))
          : Promise.resolve({}),
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
      this._productionLinkMode = (configRaw && configRaw.productionLinkMode) || 'order';

      if (this._isReturn) {
        let stockRecords = [];
        let outsourceRecords = [];
        let orders = [];

        if (this._returnPrefill) {
          stockRecords = this._returnPrefill.stockRecords || [];
          orders = this._returnPrefill.orders || [];
        } else if (this._isOutsource) {
          if (this._scopeMode === 'product') {
            orders = await fetchOrdersByProductId(this._productId);
            this._order = null;
            const recordsRaw = await fetchProductionRecords({
              types: 'STOCK_OUT,STOCK_RETURN',
              sourceProductIds: this._productId,
              orderIds: orders.map((o) => o.id).join(','),
            });
            stockRecords = Array.isArray(recordsRaw) ? recordsRaw : (recordsRaw.data || []);
          } else {
            const order = await getOrder(this._orderId);
            this._order = order;
            orders = [order];
            const recordsRaw = await fetchProductionRecords({
              types: 'STOCK_OUT,STOCK_RETURN',
              orderIds: this._orderId,
            });
            stockRecords = Array.isArray(recordsRaw) ? recordsRaw : (recordsRaw.data || []);
          }
          const outsourceRaw = await fetchProductionRecords({ type: 'OUTSOURCE', all: 'true' });
          outsourceRecords = Array.isArray(outsourceRaw) ? outsourceRaw : (outsourceRaw.data || []);
        }

        let heroOrderNumber = '';
        let heroProductName = '—';
        let heroProductSku = '';
        let heroShowProductSku = false;
        let heroShowOrderNumber = false;
        if (this._returnPrefill) {
          heroOrderNumber = this._returnPrefill.orderNumber || '';
          heroProductName = this._returnPrefill.productName || '—';
          heroShowOrderNumber = Boolean(heroOrderNumber);
        } else if (this._isOutsource) {
          if (this._scopeMode === 'product') {
            const product = this._productsById.get(this._productId);
            heroProductName = (product && product.name) || '—';
            heroProductSku = (product && product.sku) || '';
            heroShowProductSku = Boolean(heroProductSku);
          } else if (this._order) {
            const product = this._productsById.get(this._order.productId);
            heroOrderNumber = this._order.orderNumber || '';
            heroProductName = (product && product.name) || this._order.productName || '—';
            heroProductSku = (product && product.sku) || this._order.sku || '';
            heroShowProductSku = Boolean(heroProductSku);
            heroShowOrderNumber = Boolean(heroOrderNumber);
          }
        }

        await this.loadReturnData({
          boms,
          products,
          whList,
          globalNodes,
          orderNumber: heroOrderNumber,
          productName: heroProductName,
          productSku: heroProductSku,
          showProductSku: heroShowProductSku,
          showOrderNumber: heroShowOrderNumber,
          stockRecords,
          outsourceRecords,
          orders,
        });
        return;
      }

      await this.loadIssueData({ boms, products, whList, globalNodes });
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
      const hint = this._isReturn
        ? '请填写本次退料数量'
        : '请填写本次领料数量';
      wx.showToast({ title: hint, icon: 'none' });
      return;
    }

    if (this._isReturn) {
      const returnErrors = [
        ...validateReturnRows(activeRows, { isOutsource: this._isOutsource }),
        ...validateReturnBatchRows(activeRows),
      ];
      if (returnErrors.length) {
        wx.showToast({ title: returnErrors[0], icon: 'none' });
        return;
      }
    } else {
      const batchErrors = validateMaterialIssueBatchRows(activeRows);
      if (batchErrors.length) {
        wx.showToast({ title: batchErrors[0], icon: 'none' });
        return;
      }
    }

    const selected = activeRows.map((row) => ({
      productId: row.materialProductId,
      name: row.name,
      quantity: row.issueQty,
      batchNo: row.batchNo || '',
    }));

    const payload = buildProductionRecordBatchPayload({
      mode: this._isReturn ? 'stock_return' : 'stock_out',
      rows: selected,
      orderId: this._scopeMode === 'order' && this._order ? this._order.id : undefined,
      sourceProductId: this._scopeMode === 'product' ? (this._sourceProductId || undefined) : undefined,
      warehouse,
      operator: readOperatorDisplayName(),
      reason: this._isRework ? '来自于返工' : undefined,
      partner: (() => {
        if (this._isOutsource && this._partnerKey) return this._partnerKey;
        if (this._isMaterialCenter && this._partnerKey && this._partnerKey !== INTERNAL_PARTNER_KEY) {
          return this._partnerKey;
        }
        return undefined;
      })(),
    });

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      await createProductionRecordBatch(payload);
      wx.hideLoading();
      let listUrl = LIST_ROUTES.PRODUCTION_ORDERS;
      let toastTitle = this._isReturn ? '退料成功' : '领料成功';
      if (this._isOutsource) {
        listUrl = LIST_ROUTES.OUTSOURCE_HUB;
        toastTitle = this._isReturn ? '外协退料成功' : '外协领料成功';
      } else if (this._isRework) {
        listUrl = LIST_ROUTES.REWORK_HUB;
        toastTitle = '返工领料成功';
      } else if (this._isMaterialCenter) {
        listUrl = LIST_ROUTES.STOCK_OUT;
        toastTitle = this._isReturn ? '退料成功' : '领料成功';
      }
      afterSaveReturnToList({ listUrl, toastTitle });
    } catch (err) {
      wx.showToast({ title: parseBatchErrorMessage(err), icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
