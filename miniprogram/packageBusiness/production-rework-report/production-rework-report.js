const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  normalizeMasterList,
  normalizeAppDictionaries,
  productHasColorSizeMatrix,
} = require('../utils/productionPlans.js');
const { getProductUnitName } = require('../utils/planFormCustomField.js');
const {
  normalizeWorkersList,
  filterEntitiesForNode,
  needEquipmentOnReport,
} = require('../utils/orderReportForm.js');
const {
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchNodesAll,
  fetchWorkersForReport,
  createProductionRecordBatch,
  updateProductionRecord,
} = require('../utils/orderApi.js');
const { fetchEquipmentAll, fetchDictionaries } = require('../utils/planApi.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const { fetchReworkRecordsForPanel } = require('../utils/reworkRecordsLoad.js');
const {
  buildReworkReportPaths,
  groupReworkPathsByProduct,
  reworkQtyKey,
  hasAnyReworkEnteredQty,
  sumReworkEnteredForPath,
} = require('../utils/reworkReportGroupLite.js');
const {
  buildReworkReportSubmitPlan,
} = require('../utils/reworkReportSubmit.js');
const { buildVariantMatrixUiModel } = require('../utils/variantQtyMatrix.js');
const { listProductThumbFromProduct } = require('../utils/listProductThumb.js');
const { buildScanSessionUrl } = require('../../utils/scanNav.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../utils/saveNavigation.js');
const { afterMatrixKeyboardOpen } = require('../utils/matrixKeyboardLayout.js');
const {
  activateMatrixKeyboardCell,
  applyMatrixKeyboardKey,
  buildMatrixKeyboardPreview,
  createMatrixKeyboardInputSession,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../utils/matrixQtyKeyboard.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function pathRowKey(productId, pathKey) {
  return `${productId}__${pathKey}`;
}

function isOnlyUndiffPending(pendingByVariant) {
  const pendingUndiff = pendingByVariant[''] ?? 0;
  if (pendingUndiff <= 0) return false;
  return Object.keys(pendingByVariant || {}).every(
    (k) => k === '' || (pendingByVariant[k] ?? 0) <= 0,
  );
}

function sumVariantQtyForPath(quantities, productId, pathKey, variantIds) {
  return (variantIds || []).reduce((sum, vid) => {
    const key = reworkQtyKey(productId, pathKey, vid);
    return sum + (Number(quantities[key]) || 0);
  }, 0);
}

function computeCellMaxAllowed(line, variantId, quantities) {
  if (!line.hasMatrix) return 0;
  if (line.onlyUndiff) {
    const sumOthers = sumVariantQtyForPath(
      quantities,
      line.productId,
      line.pathKey,
      line.variantIds.filter((vid) => vid !== variantId),
    );
    return Math.max(0, line.pendingUndiff - sumOthers);
  }
  return Math.max(0, Number(line.maxByVariant[variantId]) || 0);
}

function buildReworkPathMatrixLayout(product, dictionaries, quantities, line) {
  if (!product || !line.hasMatrix) return null;
  const subsetVariantIds = new Set(line.variantIds || []);
  const subsetVariants = (product.variants || []).filter((v) => v?.id && subsetVariantIds.has(v.id));
  if (!subsetVariants.length) return null;

  const subsetProduct = {
    ...product,
    variants: subsetVariants,
    colorIds: product.colorIds,
    sizeIds: product.sizeIds,
  };
  const qtyMap = {};
  subsetVariants.forEach((v) => {
    const key = reworkQtyKey(line.productId, line.pathKey, v.id);
    if (quantities[key] != null && quantities[key] !== '') {
      qtyMap[v.id] = quantities[key];
    }
  });
  const matrix = buildVariantMatrixUiModel(subsetProduct, dictionaries, qtyMap);
  if (!matrix) return null;

  matrix.colorRows = (matrix.colorRows || []).map((row) => ({
    ...row,
    cells: (row.cells || []).map((cell) => {
      if (!cell.variantId) return cell;
      const maxQty = computeCellMaxAllowed(line, cell.variantId, quantities);
      return {
        ...cell,
        maxQtyLabel: maxQty > 0 ? `最多 ${maxQty}` : '',
      };
    }),
  }));
  return matrix;
}

function formatAmountText(totalQty, unitPrice) {
  const amount = Math.round((Number(totalQty) || 0) * (Number(unitPrice) || 0) * 100) / 100;
  return amount.toFixed(2);
}

function computeSingleProductPriceMeta(paths, ctx) {
  const { products, categories, quantities } = ctx;
  const productGroups = groupReworkPathsByProduct(paths || []);
  const showSingleProductPrice = productGroups.length === 1;
  if (!showSingleProductPrice) {
    return {
      showSingleProductPrice: false,
      showSimpleQtyInPriceRow: false,
      simpleQtyKey: '',
      simpleMaxPending: 0,
      simpleQuantity: '',
    };
  }

  const group = productGroups[0];
  let showSimpleQtyInPriceRow = false;
  let simpleQtyKey = '';
  let simpleMaxPending = 0;
  let simpleQuantity = '';

  if (group.paths.length === 1) {
    const product = (products || []).find((p) => p.id === group.productId);
    const category = product
      ? (categories || []).find((c) => c.id === product.categoryId)
      : null;
    const hasMatrix = productHasColorSizeMatrix(product, category)
      && !!(product && product.variants && product.variants.length);
    if (!hasMatrix) {
      const path = group.paths[0];
      simpleQtyKey = reworkQtyKey(group.productId, path.pathKey);
      simpleMaxPending = path.totalPending;
      simpleQuantity = (quantities || {})[simpleQtyKey] != null
        ? String((quantities || {})[simpleQtyKey])
        : '';
      showSimpleQtyInPriceRow = true;
    }
  }

  return {
    showSingleProductPrice: true,
    showSimpleQtyInPriceRow,
    simpleQtyKey,
    simpleMaxPending,
    simpleQuantity,
  };
}

function quantitiesForVariantLine(line, quantities) {
  if (!line) return {};
  const out = {};
  (line.variantIds || []).forEach((vid) => {
    const key = reworkQtyKey(line.productId, line.pathKey, vid);
    if (quantities[key] != null) out[vid] = quantities[key];
  });
  return out;
}

Page({
  data: {
    loading: true,
    submitting: false,
    orderId: '',
    productId: '',
    nodeId: '',
    outsourcePartner: '',
    isOutsourceRework: false,
    nodeName: '',
    orderNumber: '',
    productName: '',
    contextHint: '',
    unitName: '件',
    lines: [],
    showSingleProductPrice: false,
    showSimpleQtyInPriceRow: false,
    simpleQtyKey: '',
    simpleMaxPending: 0,
    simpleQuantity: '',
    totalEnteredQty: 0,
    unitPrice: '',
    amountText: '',
    workers: [],
    processNodes: [],
    workerId: '',
    workerName: '',
    equipment: [],
    equipmentNames: [],
    equipmentPickerIndex: 0,
    equipmentId: '',
    equipmentName: '',
    needEquipment: false,
    canSubmit: false,
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixRowKey: '',
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    matrixScrollTop: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  _quantities: {},

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._matrixKbInput = createMatrixKeyboardInputSession();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      orderId: options.orderId ? decodeURIComponent(options.orderId) : '',
      productId: options.productId ? decodeURIComponent(options.productId) : '',
      nodeId: options.nodeId ? decodeURIComponent(options.nodeId) : '',
      outsourcePartner: options.outsourcePartner ? decodeURIComponent(options.outsourcePartner) : '',
    });
    this.setData({
      isOutsourceRework: !!this.data.outsourcePartner,
    });

    if (!this.data.nodeId) {
      wx.showToast({ title: '参数不完整', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.bootstrap();
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    if (!hasPermission(ctx.permissions || [], 'production:rework_report_records:create')) {
      wx.showToast({ title: '无返工报工权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    const ctx = readTenantCtx();
    const {
      orderId,
      productId,
      nodeId,
      outsourcePartner,
      isOutsourceRework,
    } = this.data;

    try {
      const [
        config,
        orders,
        productsRaw,
        categoriesRaw,
        nodesRaw,
        workersRaw,
        equipmentRaw,
        dictionariesRaw,
      ] = await Promise.all([
        fetchTenantConfig(),
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchNodesAll(),
        fetchWorkersForReport(ctx && ctx.tenantId),
        fetchEquipmentAll(),
        fetchDictionaries(),
      ]);

      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const nodes = normalizeMasterList(nodesRaw);
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const equipmentFeaturesEnabled = readTenantCtx()?.equipmentFeaturesEnabled !== false;
      const needEquipment = needEquipmentOnReport(nodes, nodeId, equipmentFeaturesEnabled);

      const records = await fetchReworkRecordsForPanel({
        productionLinkMode,
        orders: orders || [],
        products,
      });

      const paths = buildReworkReportPaths({
        records: records || [],
        currentNodeId: nodeId,
        isOutsourceRework,
        outsourcePartner,
        globalNodes: nodes,
        anchorProductId: productId || undefined,
        scopeProductId: productId || undefined,
        scopeOrderId: productionLinkMode === 'order' ? (orderId || undefined) : undefined,
      });

      if (!paths.length) {
        wx.showToast({ title: '暂无待返工数量', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1000);
        return;
      }

      const node = nodes.find((n) => n.id === nodeId);
      const order = orderId ? (orders || []).find((o) => o.id === orderId) : null;
      const anchorProduct = productId
        ? products.find((p) => p.id === productId)
        : (order ? products.find((p) => p.id === order.productId) : null);

      const workersNormalized = normalizeWorkersList(workersRaw).filter(
        (w) => !w.status || w.status === 'ACTIVE',
      );
      const processNodes = nodes.map((n) => ({ id: n.id, name: n.name || n.id }));
      const equipment = needEquipment ? filterEntitiesForNode(equipmentRaw, nodeId) : [];
      const equipmentNames = equipment.map((e) => e.name || e.code || e.id);
      const productGroups = groupReworkPathsByProduct(paths);
      const showSingleProductPrice = productGroups.length === 1;

      this._records = records || [];
      this._paths = paths;
      this._products = products;
      this._categories = categories;
      this._dictionaries = dictionaries;
      this._nodes = nodes;
      this._productionLinkMode = productionLinkMode;
      this._tenantDisplayName = readOperatorDisplayName();
      this._quantities = {};

      const lines = this.buildLines(paths, {
        products,
        categories,
        dictionaries,
        quantities: this._quantities,
      });
      const priceMeta = computeSingleProductPriceMeta(paths, {
        products,
        categories,
        quantities: this._quantities,
      });

      const unitName = getProductUnitName(anchorProduct, dictionaries);
      let contextHint = '';
      if (isOutsourceRework && outsourcePartner) {
        contextHint = `委外：${outsourcePartner}`;
      } else if (order && order.orderNumber) {
        contextHint = order.orderNumber;
      } else if (anchorProduct && anchorProduct.name) {
        contextHint = anchorProduct.name;
      }

      this.setData({
        loading: false,
        nodeName: (node && node.name) || nodeId,
        orderNumber: (order && order.orderNumber) || '',
        productName: (anchorProduct && anchorProduct.name) || (order && order.productName) || '',
        contextHint,
        unitName,
        lines,
        showSingleProductPrice,
        showSimpleQtyInPriceRow: priceMeta.showSimpleQtyInPriceRow,
        simpleQtyKey: priceMeta.simpleQtyKey,
        simpleMaxPending: priceMeta.simpleMaxPending,
        simpleQuantity: priceMeta.simpleQuantity,
        workers: workersNormalized,
        processNodes,
        currentNodeId: nodeId,
        workerId: '',
        workerName: '',
        equipment,
        equipmentNames,
        equipmentPickerIndex: 0,
        equipmentId: '',
        equipmentName: '',
        needEquipment,
        totalEnteredQty: 0,
        unitPrice: '',
        amountText: '',
      });
      this.refreshCanSubmit();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
    }
  },

  buildLines(paths, ctx) {
    const { products, categories, dictionaries, quantities } = ctx;
    const byProduct = groupReworkPathsByProduct(paths);
    const lines = [];

    byProduct.forEach((group) => {
      const product = products.find((p) => p.id === group.productId);
      const category = product ? categories.find((c) => c.id === product.categoryId) : null;
      const hasMatrix = productHasColorSizeMatrix(product, category)
        && !!(product && product.variants && product.variants.length);
      const variantIds = hasMatrix ? (product.variants || []).map((v) => v.id).filter(Boolean) : [];
      const thumb = listProductThumbFromProduct(product);
      const unitName = getProductUnitName(product, dictionaries);
      const showPathLabel = group.paths.length > 1;

      group.paths.forEach((path) => {
        const rowKey = pathRowKey(group.productId, path.pathKey);
        const onlyUndiff = hasMatrix && isOnlyUndiffPending(path.pendingByVariant || {});
        const pendingUndiff = path.pendingByVariant[''] ?? 0;
        const showUndiffInput = hasMatrix && !onlyUndiff && pendingUndiff > 0;
        const maxByVariant = {};
        Object.entries(path.pendingByVariant || {}).forEach(([vid, q]) => {
          if (vid && q > 0) maxByVariant[vid] = q;
        });

        const line = {
          rowKey,
          productId: group.productId,
          pathKey: path.pathKey,
          pathLabel: path.pathLabel,
          showPathLabel,
          totalPending: path.totalPending,
          hasMatrix,
          onlyUndiff,
          showUndiffInput,
          pendingUndiff,
          undiffKey: reworkQtyKey(group.productId, path.pathKey, ''),
          undiffQuantity: quantities[reworkQtyKey(group.productId, path.pathKey, '')] || '',
          variantIds,
          maxByVariant,
          simpleQtyKey: reworkQtyKey(group.productId, path.pathKey),
          quantity: quantities[reworkQtyKey(group.productId, path.pathKey)] || '',
          maxPending: path.totalPending,
          enteredQty: sumReworkEnteredForPath(
            quantities,
            group.productId,
            path.pathKey,
          ),
          unitName,
          productName: (product && product.name) || group.productId,
          ...thumb,
        };

        if (hasMatrix) {
          line.matrixLayout = buildReworkPathMatrixLayout(product, dictionaries, quantities, line);
        }
        lines.push(line);
      });
    });

    return lines;
  },

  rebuildLines() {
    const lines = this.buildLines(this._paths || [], {
      products: this._products || [],
      categories: this._categories || [],
      dictionaries: this._dictionaries || {},
      quantities: this._quantities,
    });
    const totalEnteredQty = lines.reduce((s, line) => s + (Number(line.enteredQty) || 0), 0);
    const unitPrice = Number(this.data.unitPrice) || 0;
    const priceMeta = computeSingleProductPriceMeta(this._paths || [], {
      products: this._products || [],
      categories: this._categories || [],
      quantities: this._quantities,
    });
    const patch = {
      lines,
      totalEnteredQty,
      amountText: formatAmountText(totalEnteredQty, unitPrice),
      showSingleProductPrice: priceMeta.showSingleProductPrice,
      showSimpleQtyInPriceRow: priceMeta.showSimpleQtyInPriceRow,
      simpleQtyKey: priceMeta.simpleQtyKey,
      simpleMaxPending: priceMeta.simpleMaxPending,
      simpleQuantity: priceMeta.simpleQuantity,
    };
    if (this.data.activeMatrixRowKey && this.data.activeMatrixVariantId) {
      const activeLine = lines.find((l) => l.rowKey === this.data.activeMatrixRowKey);
      if (activeLine && activeLine.matrixLayout) {
        const preview = buildMatrixKeyboardPreview(
          activeLine.matrixLayout,
          this.data.activeMatrixVariantId,
          quantitiesForVariantLine(activeLine, this._quantities),
        );
        patch.matrixKeyboardLabel = preview.label;
        patch.matrixKeyboardValue = preview.value;
      }
    }
    this.setData(patch);
    this.refreshCanSubmit();
  },

  refreshCanSubmit() {
    const canSubmit = hasAnyReworkEnteredQty(this._quantities);
    if (canSubmit !== this.data.canSubmit) {
      this.setData({ canSubmit });
    }
  },

  onWorkerChange(e) {
    const { id, name } = e.detail || {};
    if (!id) return;
    this.setData({
      workerId: id,
      workerName: name || '',
    });
  },

  onEquipmentChange(e) {
    const idx = Number(e.detail.value) || 0;
    const eq = (this.data.equipment || [])[idx];
    if (!eq) return;
    this.setData({
      equipmentPickerIndex: idx,
      equipmentId: eq.id,
      equipmentName: eq.name || eq.code || '',
    });
  },

  onUnitPriceInput(e) {
    const unitPrice = e.detail.value || '';
    const totalEnteredQty = Number(this.data.totalEnteredQty) || 0;
    this.setData({
      unitPrice,
      amountText: formatAmountText(totalEnteredQty, Number(unitPrice) || 0),
    });
  },

  onSimpleQtyInput(e) {
    const { key } = e.currentTarget.dataset;
    if (!key) return;
    const line = (this.data.lines || []).find((l) => l.simpleQtyKey === key || l.rowKey === key);
    let max = line ? line.maxPending : 0;
    if (!max && key === this.data.simpleQtyKey) {
      max = Number(this.data.simpleMaxPending) || 0;
    }
    let value = Math.max(0, Number(e.detail.value) || 0);
    if (max > 0 && value > max) value = max;
    this._quantities[key] = value > 0 ? String(value) : '';
    this.rebuildLines();
  },

  onSimpleQtyStep(e) {
    const { key, delta } = e.currentTarget.dataset;
    if (!key) return;
    const line = (this.data.lines || []).find((l) => l.simpleQtyKey === key);
    const max = line ? line.maxPending : 0;
    const current = Number(this._quantities[key]) || 0;
    let next = current + (Number(delta) || 0);
    if (next < 0) next = 0;
    if (max > 0 && next > max) next = max;
    this._quantities[key] = next > 0 ? String(next) : '';
    this.rebuildLines();
  },

  onUndiffQtyInput(e) {
    const { key } = e.currentTarget.dataset;
    if (!key) return;
    const line = (this.data.lines || []).find((l) => l.undiffKey === key);
    const max = line ? line.pendingUndiff : 0;
    let value = Math.max(0, Number(e.detail.value) || 0);
    if (max > 0 && value > max) value = max;
    this._quantities[key] = value > 0 ? String(value) : '';
    this.rebuildLines();
  },

  onMatrixCellTap(e) {
    const { rowKey, variantId } = e.currentTarget.dataset;
    if (!rowKey || !variantId) return;
    const line = (this.data.lines || []).find((l) => l.rowKey === rowKey);
    if (!line || !line.matrixLayout) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      line.matrixLayout,
      variantId,
      quantitiesForVariantLine(line, this._quantities),
    );
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixRowKey: rowKey,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    }, () => {
      afterMatrixKeyboardOpen(this, '.plan-create-scroll');
    });
  },

  onMatrixKeyboardAction(e) {
    const { action, digit } = e.detail || {};
    if (action === 'confirm') {
      this.setData({
        matrixKeyboardVisible: false,
        matrixInputReplaceAll: false,
        activeMatrixRowKey: '',
        activeMatrixVariantId: '',
        matrixKeyboardLabel: '',
        matrixKeyboardValue: '',
      });
      return;
    }

    const {
      activeMatrixRowKey,
      activeMatrixVariantId,
      lines,
    } = this.data;
    const activeLine = (lines || []).find((l) => l.rowKey === activeMatrixRowKey);
    if (!activeLine || !activeLine.matrixLayout) return;

    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(activeLine.matrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(
          activeLine.matrixLayout,
          nextId,
          quantitiesForVariantLine(activeLine, this._quantities),
        );
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        }, () => {
          afterMatrixKeyboardOpen(this, '.plan-create-scroll');
        });
      } else {
        this.setData({
          matrixKeyboardVisible: false,
          matrixInputReplaceAll: false,
          activeMatrixRowKey: '',
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: '',
        });
      }
      return;
    }

    if (action === 'next') {
      const nextId = getNextMatrixVariantIdInColumn(activeLine.matrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(
          activeLine.matrixLayout,
          nextId,
          quantitiesForVariantLine(activeLine, this._quantities),
        );
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        }, () => {
          afterMatrixKeyboardOpen(this, '.plan-create-scroll');
        });
      } else {
        this.setData({
          matrixKeyboardVisible: false,
          matrixInputReplaceAll: false,
          activeMatrixRowKey: '',
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: '',
        });
      }
      return;
    }

    if (!activeMatrixVariantId) return;
    const qtyKey = reworkQtyKey(activeLine.productId, activeLine.pathKey, activeMatrixVariantId);
    const current = this._quantities[qtyKey] || '';
    const { value, replaceConsumed } = applyMatrixKeyboardKey(
      this._matrixKbInput,
      current,
      action,
      digit,
    );
    let nextValue = value;
    const maxAllowed = computeCellMaxAllowed(activeLine, activeMatrixVariantId, {
      ...this._quantities,
      [qtyKey]: value,
    });
    if (maxAllowed >= 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > maxAllowed) {
        nextValue = maxAllowed > 0 ? String(maxAllowed) : '';
      }
    }
    this._quantities[qtyKey] = nextValue;
    if (replaceConsumed) {
      this.setData({ matrixInputReplaceAll: false });
    }
    this.rebuildLines();
  },

  onGoScan() {
    const {
      orderId,
      productId,
      nodeId,
      nodeName,
      outsourcePartner,
    } = this.data;
    wx.navigateTo({
      url: buildScanSessionUrl({
        type: 'rework',
        orderId: orderId || undefined,
        productId: productId || undefined,
        reworkNodeId: nodeId,
        reworkNodeName: nodeName,
        partnerName: outsourcePartner || undefined,
      }),
    });
  },

  onProductImageError(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const lines = (this.data.lines || []).map((line) => (
      line.rowKey === key ? { ...line, showProductImage: false } : line
    ));
    this.setData({ lines });
  },

  async onSubmit() {
    if (this.data.submitting || !this.data.canSubmit) return;

    const quantities = {};
    Object.entries(this._quantities || {}).forEach(([key, raw]) => {
      const qty = Number(raw) || 0;
      if (qty > 0) quantities[key] = qty;
    });

    const plan = buildReworkReportSubmitPlan({
      records: this._records || [],
      quantities,
      globalNodes: this._nodes || [],
      currentNodeId: this.data.nodeId,
      isOutsourceRework: this.data.isOutsourceRework,
      outsourcePartner: this.data.outsourcePartner,
      scopeOrderId: this._productionLinkMode === 'order' ? (this.data.orderId || undefined) : undefined,
      scopeProductId: this.data.productId || undefined,
      operator: this._tenantDisplayName || '',
      workerId: this.data.workerId || '',
      equipmentId: this.data.equipmentId || '',
      unitPrice: Number(this.data.unitPrice) || 0,
    });

    if (plan.error) {
      wx.showToast({ title: plan.error, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中…', mask: true });
    try {
      const createBatch = [
        ...(plan.reportRecords || []),
        ...(plan.outsourceReceiveRecords || []),
      ];
      if (createBatch.length) {
        await createProductionRecordBatch(createBatch);
      }
      const sourceUpdates = plan.sourceUpdates || [];
      for (let i = 0; i < sourceUpdates.length; i += 1) {
        const upd = sourceUpdates[i];
        await updateProductionRecord(upd.id, {
          reworkCompletedQuantityByNode: upd.reworkCompletedQuantityByNode,
          status: upd.status,
        });
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.REWORK_HUB,
        toastTitle: '返工报工成功',
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
