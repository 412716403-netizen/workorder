const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx,readOperatorDisplayName = _require.readOperatorDisplayName;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =



  require('../../utils/productionPlans.js'),normalizeMasterList = _require3.normalizeMasterList,normalizeAppDictionaries = _require3.normalizeAppDictionaries,productHasColorSizeMatrix = _require3.productHasColorSizeMatrix;
const _require4 = require('../../utils/planFormCustomField.js'),getProductUnitName = _require4.getProductUnitName;
const _require5 =



  require('../../utils/orderReportForm.js'),normalizeWorkersList = _require5.normalizeWorkersList,filterEntitiesForNode = _require5.filterEntitiesForNode,needEquipmentOnReport = _require5.needEquipmentOnReport;
const _require6 =







  require('../../utils/orderApi.js'),fetchTenantConfig = _require6.fetchTenantConfig,fetchProductsAll = _require6.fetchProductsAll,fetchCategoriesAll = _require6.fetchCategoriesAll,fetchNodesAll = _require6.fetchNodesAll,fetchWorkersForReport = _require6.fetchWorkersForReport,createProductionRecordBatch = _require6.createProductionRecordBatch,updateProductionRecord = _require6.updateProductionRecord;
const _require7 = require('../../utils/planApi.js'),fetchEquipmentAll = _require7.fetchEquipmentAll,fetchDictionaries = _require7.fetchDictionaries;
const _require8 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require8.fetchAllOrdersPaginated;
const _require9 = require('../utils/reworkRecordsLoad.js'),fetchReworkRecordsForPanel = _require9.fetchReworkRecordsForPanel;
const _require0 =





  require('../utils/reworkReportGroupLite.js'),buildReworkReportPaths = _require0.buildReworkReportPaths,groupReworkPathsByProduct = _require0.groupReworkPathsByProduct,reworkQtyKey = _require0.reworkQtyKey,hasAnyReworkEnteredQty = _require0.hasAnyReworkEnteredQty,sumReworkEnteredForPath = _require0.sumReworkEnteredForPath;
const _require1 =

  require('../utils/reworkReportSubmit.js'),buildReworkReportSubmitPlan = _require1.buildReworkReportSubmitPlan;
const _require10 = require('../../utils/variantQtyMatrix.js'),buildVariantMatrixUiModel = _require10.buildVariantMatrixUiModel;
const _require11 = require('../../utils/listProductThumb.js'),listProductThumbFromProduct = _require11.listProductThumbFromProduct;
const _require12 = require('../utils/scanBatchController.js'),createScanBatchController = _require12.createScanBatchController;
const _require13 = require('../utils/scanBatchApplyRework.js'),createReworkReportScanBatchHandlers = _require13.createReworkReportScanBatchHandlers;
const _require14 =



  require('../../utils/windowMetrics.js'),readNavBarMetrics = _require14.readNavBarMetrics,readWindowMetrics = _require14.readWindowMetrics,computePlanCreateHeaderHeight = _require14.computePlanCreateHeaderHeight;
const _require15 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require15.LIST_ROUTES,afterSaveReturnToList = _require15.afterSaveReturnToList;
const { defaultEntryDate, defaultEntryTimeHm, entryDateAndTimeToIso } = require('../../utils/docEntryTime.js');
const _require16 = require('../../utils/matrixKeyboardLayout.js'),afterMatrixKeyboardOpen = _require16.afterMatrixKeyboardOpen,handleMatrixOutsideTap = _require16.handleMatrixOutsideTap;
const _require17 =






  require('../../utils/matrixQtyKeyboard.js'),activateMatrixKeyboardCell = _require17.activateMatrixKeyboardCell,applyMatrixKeyboardKey = _require17.applyMatrixKeyboardKey,buildMatrixKeyboardPreview = _require17.buildMatrixKeyboardPreview,createMatrixKeyboardInputSession = _require17.createMatrixKeyboardInputSession,getNextMatrixVariantIdInColumn = _require17.getNextMatrixVariantIdInColumn,getNextMatrixVariantIdInRow = _require17.getNextMatrixVariantIdInRow;
const _require18 = require('../../utils/featurePlugins.js'),loadTraceabilityScanEnabled = _require18.loadTraceabilityScanEnabled;

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

function isOnlyUndiffPending(pendingByVariant) {var _pendingByVariant$;
  const pendingUndiff = (_pendingByVariant$ = pendingByVariant['']) != null ? _pendingByVariant$ : 0;
  if (pendingUndiff <= 0) return false;
  return Object.keys(pendingByVariant || {}).every(
    (k) => {var _pendingByVariant$k;return k === '' || ((_pendingByVariant$k = pendingByVariant[k]) != null ? _pendingByVariant$k : 0) <= 0;}
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
      line.variantIds.filter((vid) => vid !== variantId)
    );
    return Math.max(0, line.pendingUndiff - sumOthers);
  }
  return Math.max(0, Number(line.maxByVariant[variantId]) || 0);
}

function buildReworkPathMatrixLayout(product, dictionaries, quantities, line) {
  if (!product || !line.hasMatrix) return null;
  const subsetVariantIds = new Set(line.variantIds || []);
  const subsetVariants = (product.variants || []).filter((v) => (v == null ? void 0 : v.id) && subsetVariantIds.has(v.id));
  if (!subsetVariants.length) return null;

  const subsetProduct = {
    ...product,
    variants: subsetVariants,
    colorIds: product.colorIds,
    sizeIds: product.sizeIds
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
        maxQtyLabel: maxQty > 0 ? `最多 ${maxQty}` : ''
      };
    })
  }));
  return matrix;
}

function formatAmountText(totalQty, unitPrice) {
  const amount = Math.round((Number(totalQty) || 0) * (Number(unitPrice) || 0) * 100) / 100;
  return amount.toFixed(2);
}

function computeSingleProductPriceMeta(paths, ctx) {
  const products = ctx.products,categories = ctx.categories,quantities = ctx.quantities;
  const productGroups = groupReworkPathsByProduct(paths || []);
  const showSingleProductPrice = productGroups.length === 1;
  if (!showSingleProductPrice) {
    return {
      showSingleProductPrice: false,
      showSimpleQtyInPriceRow: false,
      simpleQtyKey: '',
      simpleMaxPending: 0,
      simpleQuantity: ''
    };
  }

  const group = productGroups[0];
  let showSimpleQtyInPriceRow = false;
  let simpleQtyKey = '';
  let simpleMaxPending = 0;
  let simpleQuantity = '';

  if (group.paths.length === 1) {
    const product = (products || []).find((p) => p.id === group.productId);
    const category = product ?
    (categories || []).find((c) => c.id === product.categoryId) :
    null;
    const hasMatrix = productHasColorSizeMatrix(product, category) &&
    !!(product && product.variants && product.variants.length);
    if (!hasMatrix) {
      const path = group.paths[0];
      simpleQtyKey = reworkQtyKey(group.productId, path.pathKey);
      simpleMaxPending = path.totalPending;
      simpleQuantity = (quantities || {})[simpleQtyKey] != null ?
      String((quantities || {})[simpleQtyKey]) :
      '';
      showSimpleQtyInPriceRow = true;
    }
  }

  return {
    showSingleProductPrice: true,
    showSimpleQtyInPriceRow,
    simpleQtyKey,
    simpleMaxPending,
    simpleQuantity
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
    scanEnabled: false,
    entryDate: '',
    entryTime: '',
    pickerSheetOpen: false,
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
      entryDate: defaultEntryDate(),
      entryTime: defaultEntryTimeHm(),
    });
    this.setData({
      isOutsourceRework: !!this.data.outsourcePartner
    });

    if (!this.data.nodeId) {
      wx.showToast({ title: '参数不完整', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const reworkScan = createReworkReportScanBatchHandlers(this);
    this._scanBatch = createScanBatchController(this, {
      title: '返工报工 · 批量扫码',
      showScanIntentToggle: true,
      resolveRowPreview: (payload) => reworkScan.resolveRowPreview(payload),
      onConfirm: (payloads) => reworkScan.onConfirm(payloads)
    });
    this.bootstrap();
    loadTraceabilityScanEnabled().then((scanEnabled) => {
      this.setData({ scanEnabled });
    });
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
    const _this$data =





      this.data,orderId = _this$data.orderId,productId = _this$data.productId,nodeId = _this$data.nodeId,outsourcePartner = _this$data.outsourcePartner,isOutsourceRework = _this$data.isOutsourceRework;

    try {var _readTenantCtx;
      const _await$Promise$all =








        await Promise.all([
        fetchTenantConfig(),
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchNodesAll(),
        fetchWorkersForReport(ctx && ctx.tenantId),
        fetchEquipmentAll(),
        fetchDictionaries()]
        ),config = _await$Promise$all[0],orders = _await$Promise$all[1],productsRaw = _await$Promise$all[2],categoriesRaw = _await$Promise$all[3],nodesRaw = _await$Promise$all[4],workersRaw = _await$Promise$all[5],equipmentRaw = _await$Promise$all[6],dictionariesRaw = _await$Promise$all[7];

      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const nodes = normalizeMasterList(nodesRaw);
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);
      const productionLinkMode = config && config.productionLinkMode || 'order';
      const equipmentFeaturesEnabled = ((_readTenantCtx = readTenantCtx()) == null ? void 0 : _readTenantCtx.equipmentFeaturesEnabled) !== false;
      const needEquipment = needEquipmentOnReport(nodes, nodeId, equipmentFeaturesEnabled);

      const records = await fetchReworkRecordsForPanel({
        productionLinkMode,
        orders: orders || [],
        products
      });

      const paths = buildReworkReportPaths({
        records: records || [],
        currentNodeId: nodeId,
        isOutsourceRework,
        outsourcePartner,
        globalNodes: nodes,
        anchorProductId: productId || undefined,
        scopeProductId: productId || undefined,
        scopeOrderId: productionLinkMode === 'order' ? orderId || undefined : undefined
      });

      if (!paths.length) {
        wx.showToast({ title: '暂无待返工数量', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1000);
        return;
      }

      const node = nodes.find((n) => n.id === nodeId);
      const order = orderId ? (orders || []).find((o) => o.id === orderId) : null;
      const anchorProduct = productId ?
      products.find((p) => p.id === productId) :
      order ? products.find((p) => p.id === order.productId) : null;

      const workersNormalized = normalizeWorkersList(workersRaw).filter(
        (w) => !w.status || w.status === 'ACTIVE'
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
        quantities: this._quantities
      });
      const priceMeta = computeSingleProductPriceMeta(paths, {
        products,
        categories,
        quantities: this._quantities
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
        nodeName: node && node.name || nodeId,
        orderNumber: order && order.orderNumber || '',
        productName: anchorProduct && anchorProduct.name || order && order.productName || '',
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
        amountText: ''
      });
      this.refreshCanSubmit();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
    }
  },

  buildLines(paths, ctx) {
    const products = ctx.products,categories = ctx.categories,dictionaries = ctx.dictionaries,quantities = ctx.quantities;
    const byProduct = groupReworkPathsByProduct(paths);
    const lines = [];

    byProduct.forEach((group) => {
      const product = products.find((p) => p.id === group.productId);
      const category = product ? categories.find((c) => c.id === product.categoryId) : null;
      const hasMatrix = productHasColorSizeMatrix(product, category) &&
      !!(product && product.variants && product.variants.length);
      const variantIds = hasMatrix ? (product.variants || []).map((v) => v.id).filter(Boolean) : [];
      const thumb = listProductThumbFromProduct(product);
      const unitName = getProductUnitName(product, dictionaries);
      const showPathLabel = group.paths.length > 1;

      group.paths.forEach((path) => {var _path$pendingByVarian;
        const rowKey = pathRowKey(group.productId, path.pathKey);
        const onlyUndiff = hasMatrix && isOnlyUndiffPending(path.pendingByVariant || {});
        const pendingUndiff = (_path$pendingByVarian = path.pendingByVariant['']) != null ? _path$pendingByVarian : 0;
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
            path.pathKey
          ),
          unitName,
          productName: product && product.name || group.productId,
          ...thumb
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
      quantities: this._quantities
    });
    const totalEnteredQty = lines.reduce((s, line) => s + (Number(line.enteredQty) || 0), 0);
    const unitPrice = Number(this.data.unitPrice) || 0;
    const priceMeta = computeSingleProductPriceMeta(this._paths || [], {
      products: this._products || [],
      categories: this._categories || [],
      quantities: this._quantities
    });
    const patch = {
      lines,
      totalEnteredQty,
      amountText: formatAmountText(totalEnteredQty, unitPrice),
      showSingleProductPrice: priceMeta.showSingleProductPrice,
      showSimpleQtyInPriceRow: priceMeta.showSimpleQtyInPriceRow,
      simpleQtyKey: priceMeta.simpleQtyKey,
      simpleMaxPending: priceMeta.simpleMaxPending,
      simpleQuantity: priceMeta.simpleQuantity
    };
    if (this.data.activeMatrixRowKey && this.data.activeMatrixVariantId) {
      const activeLine = lines.find((l) => l.rowKey === this.data.activeMatrixRowKey);
      if (activeLine && activeLine.matrixLayout) {
        const preview = buildMatrixKeyboardPreview(
          activeLine.matrixLayout,
          this.data.activeMatrixVariantId,
          quantitiesForVariantLine(activeLine, this._quantities)
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
    const _ref = e.detail || {},id = _ref.id,name = _ref.name;
    if (!id) return;
    this.setData({
      workerId: id,
      workerName: name || ''
    });
  },

  onEquipmentChange(e) {
    const idx = Number(e.detail.value) || 0;
    const eq = (this.data.equipment || [])[idx];
    if (!eq) return;
    this.setData({
      equipmentPickerIndex: idx,
      equipmentId: eq.id,
      equipmentName: eq.name || eq.code || ''
    });
  },

  onUnitPriceInput(e) {
    const unitPrice = e.detail.value || '';
    const totalEnteredQty = Number(this.data.totalEnteredQty) || 0;
    this.setData({
      unitPrice,
      amountText: formatAmountText(totalEnteredQty, Number(unitPrice) || 0)
    });
  },

  onSimpleQtyInput(e) {
    const key = e.currentTarget.dataset.key;
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
    const _e$currentTarget$data = e.currentTarget.dataset,key = _e$currentTarget$data.key,delta = _e$currentTarget$data.delta;
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
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const line = (this.data.lines || []).find((l) => l.undiffKey === key);
    const max = line ? line.pendingUndiff : 0;
    let value = Math.max(0, Number(e.detail.value) || 0);
    if (max > 0 && value > max) value = max;
    this._quantities[key] = value > 0 ? String(value) : '';
    this.rebuildLines();
  },

  onMatrixCellTap(e) {
    const _e$currentTarget$data2 = e.currentTarget.dataset,rowKey = _e$currentTarget$data2.rowKey,variantId = _e$currentTarget$data2.variantId;
    if (!rowKey || !variantId) return;
    const line = (this.data.lines || []).find((l) => l.rowKey === rowKey);
    if (!line || !line.matrixLayout) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      line.matrixLayout,
      variantId,
      quantitiesForVariantLine(line, this._quantities)
    );
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixRowKey: rowKey,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    }, () => {
      afterMatrixKeyboardOpen(this, '.plan-create-scroll');
    });
  },

  onMatrixOutsideTap() {
    handleMatrixOutsideTap(this);
  },


  onMatrixKeyboardAction(e) {
    const _ref2 = e.detail || {},action = _ref2.action,digit = _ref2.digit;
    if (action === 'confirm') {
      this.setData({
        matrixKeyboardVisible: false,
        matrixInputReplaceAll: false,
        activeMatrixRowKey: '',
        activeMatrixVariantId: '',
        matrixKeyboardLabel: '',
        matrixKeyboardValue: ''
      });
      return;
    }

    const _this$data2 =



      this.data,activeMatrixRowKey = _this$data2.activeMatrixRowKey,activeMatrixVariantId = _this$data2.activeMatrixVariantId,lines = _this$data2.lines;
    const activeLine = (lines || []).find((l) => l.rowKey === activeMatrixRowKey);
    if (!activeLine || !activeLine.matrixLayout) return;

    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(activeLine.matrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(
          activeLine.matrixLayout,
          nextId,
          quantitiesForVariantLine(activeLine, this._quantities)
        );
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value
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
          matrixKeyboardValue: ''
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
          quantitiesForVariantLine(activeLine, this._quantities)
        );
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value
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
          matrixKeyboardValue: ''
        });
      }
      return;
    }

    if (!activeMatrixVariantId) return;
    const qtyKey = reworkQtyKey(activeLine.productId, activeLine.pathKey, activeMatrixVariantId);
    const current = this._quantities[qtyKey] || '';
    const _applyMatrixKeyboardK = applyMatrixKeyboardKey(
        this._matrixKbInput,
        current,
        action,
        digit
      ),value = _applyMatrixKeyboardK.value,replaceConsumed = _applyMatrixKeyboardK.replaceConsumed;
    let nextValue = value;
    const maxAllowed = computeCellMaxAllowed(activeLine, activeMatrixVariantId, {
      ...this._quantities,
      [qtyKey]: value
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
    if (this._scanBatch) this._scanBatch.open();
  },

  onScanBatchClose() {
    if (this._scanBatch) this._scanBatch.close();
  },

  onScanBatchScan() {
    if (this._scanBatch) this._scanBatch.triggerScan();
  },

  onScanBatchConfirm() {
    if (this._scanBatch) this._scanBatch.confirm();
  },

  onScanBatchRemove(e) {
    if (this._scanBatch) this._scanBatch.removeRow(e.detail.id);
  },

  onScanBatchIntentChange(e) {
    if (this._scanBatch) this._scanBatch.setScanIntent(e.detail.intent);
  },

  onProductImageError(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const lines = (this.data.lines || []).map((line) =>
    line.rowKey === key ? { ...line, showProductImage: false } : line
    );
    this.setData({ lines });
  },

  onEntryDateTimeChange(e) {
    const detail = e.detail || {};
    this.setData({
      entryDate: detail.date || '',
      entryTime: detail.time || '',
    });
  },

  onPickerSheetOpen() {
    this.setData({ pickerSheetOpen: true });
  },

  onPickerSheetClose() {
    this.setData({ pickerSheetOpen: false });
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
      scopeOrderId: this._productionLinkMode === 'order' ? this.data.orderId || undefined : undefined,
      scopeProductId: this.data.productId || undefined,
      operator: this._tenantDisplayName || '',
      timestamp: entryDateAndTimeToIso(this.data.entryDate, this.data.entryTime),
      workerId: this.data.workerId || '',
      equipmentId: this.data.equipmentId || '',
      unitPrice: Number(this.data.unitPrice) || 0
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
      ...(plan.outsourceReceiveRecords || [])];

      if (createBatch.length) {
        await createProductionRecordBatch(createBatch);
      }
      const sourceUpdates = plan.sourceUpdates || [];
      for (let i = 0; i < sourceUpdates.length; i += 1) {
        const upd = sourceUpdates[i];
        await updateProductionRecord(upd.id, {
          reworkCompletedQuantityByNode: upd.reworkCompletedQuantityByNode,
          status: upd.status
        });
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.REWORK_HUB,
        toastTitle: '返工报工成功'
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err && err.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});