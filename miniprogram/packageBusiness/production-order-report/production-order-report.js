const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx,readOperatorDisplayName = _require.readOperatorDisplayName;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =



  require('../utils/productionPlans.js'),normalizeMasterList = _require3.normalizeMasterList,normalizeAppDictionaries = _require3.normalizeAppDictionaries,variantLabel = _require3.variantLabel;
const _require4 = require('../utils/planFormCustomField.js'),getProductUnitName = _require4.getProductUnitName;
const _require5 =


















  require('../utils/orderReportForm.js'),getEffectiveReportTemplate = _require5.getEffectiveReportTemplate,buildReportCustomFields = _require5.buildReportCustomFields,buildInitialReportCustomData = _require5.buildInitialReportCustomData,buildCustomDataPayload = _require5.buildCustomDataPayload,normalizeWorkersList = _require5.normalizeWorkersList,filterEntitiesForNode = _require5.filterEntitiesForNode,needEquipmentOnReport = _require5.needEquipmentOnReport,buildQtyHintText = _require5.buildQtyHintText,resolveReportFormMode = _require5.resolveReportFormMode,buildReportMatrixLayout = _require5.buildReportMatrixLayout,patchReportMatrixLayout = _require5.patchReportMatrixLayout,buildMultiVariantRows = _require5.buildMultiVariantRows,parseNonNegativeInt = _require5.parseNonNegativeInt,parsePositiveInt = _require5.parsePositiveInt,sumMatrixQuantities = _require5.sumMatrixQuantities,validateReportCustomFields = _require5.validateReportCustomFields,buildSubmitEntries = _require5.buildSubmitEntries,computeCanSubmit = _require5.computeCanSubmit;
const _require6 =








  require('../utils/orderApi.js'),getOrder = _require6.getOrder,createOrderReport = _require6.createOrderReport,fetchTenantConfig = _require6.fetchTenantConfig,fetchProductsAll = _require6.fetchProductsAll,fetchCategoriesAll = _require6.fetchCategoriesAll,fetchNodesAll = _require6.fetchNodesAll,fetchWorkersForReport = _require6.fetchWorkersForReport,fetchProductionRecords = _require6.fetchProductionRecords;
const _require7 =


  require('../utils/planApi.js'),fetchEquipmentAll = _require7.fetchEquipmentAll,fetchDictionaries = _require7.fetchDictionaries;
const _require8 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require8.readNavBarMetrics,readWindowMetrics = _require8.readWindowMetrics,computePlanCreateHeaderHeight = _require8.computePlanCreateHeaderHeight;
const _require9 = require('../utils/saveNavigation.js'),LIST_ROUTES = _require9.LIST_ROUTES,afterSaveReturnToList = _require9.afterSaveReturnToList;
const _require0 = require('../utils/matrixKeyboardLayout.js'),afterMatrixKeyboardOpen = _require0.afterMatrixKeyboardOpen;
const _require1 = require('../utils/scanBatchController.js'),createScanBatchController = _require1.createScanBatchController;
const _require10 = require('../utils/scanBatchApplyReport.js'),createReportScanBatchHandlers = _require10.createReportScanBatchHandlers;
const _require13 = require('../utils/reportScanMeta.js'),resetReportScanMeta = _require13.resetReportScanMeta,buildReportScanPayloadFields = _require13.buildReportScanPayloadFields;
const _require14 = require('../../utils/featurePlugins.js'),loadTraceabilityScanEnabled = _require14.loadTraceabilityScanEnabled;

function computeHeaderBlockHeight(nav) {
  return computePlanCreateHeaderHeight(nav);
}
const _require11 =






  require('../utils/matrixQtyKeyboard.js'),activateMatrixKeyboardCell = _require11.activateMatrixKeyboardCell,applyMatrixKeyboardKey = _require11.applyMatrixKeyboardKey,buildMatrixKeyboardPreview = _require11.buildMatrixKeyboardPreview,createMatrixKeyboardInputSession = _require11.createMatrixKeyboardInputSession,getNextMatrixVariantIdInColumn = _require11.getNextMatrixVariantIdInColumn,getNextMatrixVariantIdInRow = _require11.getNextMatrixVariantIdInRow;
const _require12 =




  require('../utils/reportVariantMaxQty.js'),computeOrderReportHints = _require12.computeOrderReportHints,buildVariantMaxGoodMap = _require12.buildVariantMaxGoodMap,getSingleMaxQty = _require12.getSingleMaxQty,validateReportEntries = _require12.validateReportEntries;

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function buildReportQtyHint(reportHints, unitName) {
  return buildQtyHintText({
    totalQty: reportHints.hintTotalQty,
    maxReportable: reportHints.hintMaxReportable,
    reported: reportHints.hintCompletedDisplay,
    remaining: reportHints.hintRemaining,
    defective: reportHints.defectiveQtyForHint,
    totalOutsourcedAtNode: reportHints.totalOutsourcedAtNode,
    totalRework: reportHints.totalRework
  }, unitName);
}

function buildReportQtySummaryView(stats, unitName) {
  const unit = unitName || '件';
  const empty = {
    show: false,
    maxReportable: 0,
    remaining: 0,
    reported: 0,
    totalQty: 0,
    defective: 0,
    maxReportableText: '',
    remainingText: '',
    detailText: '',
    hintText: ''
  };
  if (!stats) return empty;

  const totalQty = Math.max(0, Number(stats.totalQty) || 0);
  const maxReportable = Math.max(0, Number(stats.maxReportable) || 0);
  const remaining = Math.max(0, Number(stats.remaining) || 0);
  const reported = Math.max(0, Number(stats.reported) || 0);
  const defective = Math.max(0, Number(stats.defective) || 0);
  const hintText = buildQtyHintText(stats, unitName);

  if (!hintText && totalQty <= 0 && maxReportable <= 0 && remaining <= 0) return empty;

  let detailText = `已报 ${reported} ${unit}`;
  if (maxReportable !== totalQty && totalQty > 0) {
    detailText = `可报上限 ${maxReportable}/${totalQty} ${unit} · ${detailText}`;
  } else if (totalQty > 0) {
    detailText = `工单合计 ${totalQty} ${unit} · ${detailText}`;
  }
  if (defective > 0) {
    detailText += ` · 不良 ${defective} ${unit}`;
  }

  return {
    show: true,
    maxReportable,
    remaining,
    reported,
    totalQty,
    defective,
    maxReportableText: `${maxReportable} ${unit}`,
    remainingText: `${remaining} ${unit}`,
    detailText,
    hintText
  };
}

function findEquipmentIndex(equipment, equipmentId) {
  if (!equipmentId) return 0;
  const idx = (equipment || []).findIndex((e) => e.id === equipmentId);
  return idx >= 0 ? idx : 0;
}

function findVariantIndex(variantOptions, variantId) {
  if (!variantId) return 0;
  const idx = (variantOptions || []).findIndex((v) => v.id === variantId);
  return idx >= 0 ? idx : 0;
}

Page({
  data: {
    loading: true,
    submitting: false,
    orderId: '',
    milestoneId: '',
    orderNumber: '',
    productName: '',
    milestoneName: '',
    qtyHint: '',
    qtySummary: { show: false },
    unitName: '件',
    formMode: 'single',
    useVariantMatrix: false,
    matrixLayout: null,
    variantRows: [],
    singleQuantity: '1',
    singleDefectiveQty: '0',
    variantOptions: [],
    variantPickerIndex: 0,
    variantId: '',
    variantLabel: '',
    workers: [],
    processNodes: [],
    currentNodeId: '',
    workerId: '',
    workerName: '',
    equipment: [],
    equipmentNames: [],
    equipmentPickerIndex: 0,
    equipmentId: '',
    equipmentName: '',
    needEquipment: false,
    reportCustomFields: [],
    customData: {},
    remaining: 0,
    singleMaxQty: 0,
    singleMaxQtyLabel: '',
    allowExceedMaxReportQty: false,
    canSubmit: false,
    qtyInputMode: 'good',
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    matrixScrollTop: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    scanEnabled: false
  },

  _quantities: {},
  _defectiveQuantities: {},

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._matrixKbInput = createMatrixKeyboardInputSession();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      orderId: options.orderId ? decodeURIComponent(options.orderId) : '',
      milestoneId: options.milestoneId ? decodeURIComponent(options.milestoneId) : ''
    });

    if (!this.data.orderId || !this.data.milestoneId) {
      wx.showToast({ title: '参数不完整', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const reportScan = createReportScanBatchHandlers(this);
    resetReportScanMeta(this);
    this._scanBatch = createScanBatchController(this, {
      title: '报工 · 批量扫码',
      showScanIntentToggle: true,
      resolveRowPreview: (payload) => reportScan.resolveRowPreview(payload),
      onConfirm: (payloads) => reportScan.onConfirm(payloads)
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
    if (!hasPermission(ctx.permissions || [], 'production:orders_report_records:create')) {
      wx.showToast({ title: '无报工权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    const _this$data = this.data,orderId = _this$data.orderId,milestoneId = _this$data.milestoneId;
    const ctx = readTenantCtx();
    try {var _readTenantCtx;
      const _await$Promise$all =









        await Promise.all([
        fetchTenantConfig(),
        getOrder(orderId),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchNodesAll(),
        fetchWorkersForReport(ctx && ctx.tenantId),
        fetchEquipmentAll(),
        fetchDictionaries(),
        fetchProductionRecords({
          orderIds: orderId,
          types: 'OUTSOURCE,REWORK,REWORK_REPORT',
          all: 'true'
        })]
        ),config = _await$Promise$all[0],order = _await$Promise$all[1],productsRaw = _await$Promise$all[2],categoriesRaw = _await$Promise$all[3],nodesRaw = _await$Promise$all[4],workersRaw = _await$Promise$all[5],equipmentRaw = _await$Promise$all[6],dictionariesRaw = _await$Promise$all[7],prodRecordsRaw = _await$Promise$all[8];

      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const globalNodes = normalizeMasterList(nodesRaw);
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);
      const product = products.find((p) => p.id === order.productId) || null;
      const category = product && product.categoryId ?
      categories.find((c) => c.id === product.categoryId) :
      null;
      const milestone = (order.milestones || []).find((m) => m.id === milestoneId);
      if (!milestone) {
        wx.showToast({ title: '工序不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      const equipmentFeaturesEnabled = ((_readTenantCtx = readTenantCtx()) == null ? void 0 : _readTenantCtx.equipmentFeaturesEnabled) !== false;
      const needEquipment = needEquipmentOnReport(
        globalNodes,
        milestone.templateId,
        equipmentFeaturesEnabled
      );

      const template = getEffectiveReportTemplate(milestone, globalNodes);
      const reportCustomFields = buildReportCustomFields(template);
      const customData = buildInitialReportCustomData(reportCustomFields, product);
      const unitName = getProductUnitName(product, dictionaries);
      const orderItems = order.items || [];
      const formMode = resolveReportFormMode(product, category, orderItems);

      const reportHints = computeOrderReportHints(
        order,
        milestone,
        globalNodes,
        config,
        prodRecordsRaw || []
      );
      const variantMaxGoodMap = buildVariantMaxGoodMap(
        order,
        milestone,
        product,
        reportHints.opts,
        prodRecordsRaw || []
      );
      const allowExceedMaxReportQty = !!(config && config.allowExceedMaxReportQty);
      const remaining = reportHints.hintRemaining;
      const layoutOpts = {
        variantMaxGoodMap,
        effectiveRemainingForModal: reportHints.effectiveRemainingForModal,
        allowExceedMaxReportQty
      };

      const qtySummary = formMode === 'matrix' ?
      { show: false } :
      buildReportQtySummaryView({
        totalQty: reportHints.hintTotalQty,
        maxReportable: reportHints.hintMaxReportable,
        reported: reportHints.hintCompletedDisplay,
        remaining: reportHints.hintRemaining,
        defective: reportHints.defectiveQtyForHint,
        totalOutsourcedAtNode: reportHints.totalOutsourcedAtNode,
        totalRework: reportHints.totalRework
      }, unitName);
      const qtyHint = buildReportQtyHint(reportHints, unitName);

      const workersNormalized = normalizeWorkersList(workersRaw).filter(
        (w) => !w.status || w.status === 'ACTIVE'
      );
      const processNodes = globalNodes.map((n) => ({ id: n.id, name: n.name || n.id }));
      const equipment = needEquipment ?
      filterEntitiesForNode(equipmentRaw, milestone.templateId) :
      [];
      const equipmentNames = equipment.map((e) => e.name || e.code || e.id);

      this._order = order;
      this._milestone = milestone;
      this._product = product;
      this._category = category;
      this._dictionaries = dictionaries;
      this._reportCustomFields = reportCustomFields;
      this._variantMaxGoodMap = variantMaxGoodMap;
      this._reportHints = reportHints;
      this._layoutOpts = layoutOpts;
      this._tenantDisplayName = readOperatorDisplayName();

      this._quantities = {};
      this._defectiveQuantities = {};

      let singleQuantity = remaining > 0 ? String(Math.min(1, remaining)) : '0';
      let variantOptions = [];
      let variantId = '';
      let variantLabelText = '';
      let matrixLayout = null;
      let variantRows = [];

      if (formMode === 'matrix' && product) {
        matrixLayout = buildReportMatrixLayout(
          product,
          dictionaries,
          this._quantities,
          this._defectiveQuantities,
          layoutOpts
        );
      } else if (formMode === 'multi' && product) {
        variantRows = buildMultiVariantRows(
          product,
          category,
          dictionaries,
          orderItems,
          this._quantities,
          this._defectiveQuantities,
          variantMaxGoodMap,
          unitName
        );
      } else if (formMode === 'single') {
        const uniqueVariantIds = [...new Set(orderItems.map((it) => it.variantId).filter(Boolean))];
        if (uniqueVariantIds.length === 1) {
          variantId = uniqueVariantIds[0];
        } else if (uniqueVariantIds.length > 1) {
          variantOptions = uniqueVariantIds.map((vid) => {
            const variant = (product && product.variants || []).find((v) => v.id === vid);
            return {
              id: vid,
              label: variant ? variantLabel(variant, dictionaries) : vid
            };
          });
          variantId = variantOptions[0].id;
          variantLabelText = variantOptions[0].label;
        }
      }

      const singleMaxQty = formMode === 'single' ?
      getSingleMaxQty(
        variantMaxGoodMap,
        variantId,
        reportHints.effectiveRemainingForModal,
        allowExceedMaxReportQty
      ) :
      0;
      const singleMaxQtyLabel = singleMaxQty > 0 ? `最多 ${singleMaxQty} ${unitName}` : '';

      const statePatch = {
        loading: false,
        orderNumber: order.orderNumber || '',
        productName: order.productName || product && product.name || '',
        milestoneName: milestone.name || '',
        qtyHint,
        qtySummary,
        unitName,
        formMode,
        useVariantMatrix: formMode === 'matrix',
        matrixLayout,
        variantRows,
        singleQuantity,
        singleDefectiveQty: '0',
        variantOptions,
        variantPickerIndex: findVariantIndex(variantOptions, variantId),
        variantId,
        variantLabel: variantLabelText,
        workers: workersNormalized,
        processNodes,
        currentNodeId: milestone.templateId,
        workerId: '',
        workerName: '',
        equipment,
        equipmentNames,
        equipmentPickerIndex: 0,
        equipmentId: '',
        equipmentName: '',
        needEquipment,
        reportCustomFields,
        customData,
        remaining,
        singleMaxQty,
        singleMaxQtyLabel,
        allowExceedMaxReportQty,
        qtyInputMode: 'good'
      };

      this.setData(statePatch);
      this.refreshCanSubmit();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
    }
  },

  refreshCanSubmit() {
    const canSubmit = computeCanSubmit({
      workerId: this.data.workerId,
      needEquipment: this.data.needEquipment,
      equipmentId: this.data.equipmentId,
      formMode: this.data.formMode,
      singleQuantity: this.data.singleQuantity,
      singleDefectiveQty: this.data.singleDefectiveQty,
      variantId: this.data.variantId,
      quantities: this._quantities,
      defectiveQuantities: this._defectiveQuantities,
      variantRows: this.data.variantRows
    });
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
    this.refreshCanSubmit();
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
    this.refreshCanSubmit();
  },

  onVariantChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = (this.data.variantOptions || [])[idx];
    if (!opt) return;
    const singleMaxQty = getSingleMaxQty(
      this._variantMaxGoodMap,
      opt.id,
      this._reportHints && this._reportHints.effectiveRemainingForModal,
      this.data.allowExceedMaxReportQty
    );
    this.setData({
      variantPickerIndex: idx,
      variantId: opt.id,
      variantLabel: opt.label,
      singleMaxQty,
      singleMaxQtyLabel: singleMaxQty > 0 ? `最多 ${singleMaxQty} ${this.data.unitName}` : ''
    });
    this.refreshCanSubmit();
  },

  onSingleQtyInput(e) {
    this.setData({ singleQuantity: e.detail.value || '' });
    this.refreshCanSubmit();
  },

  onSingleDefectiveInput(e) {
    this.setData({ singleDefectiveQty: e.detail.value || '' });
    this.refreshCanSubmit();
  },

  onSingleQtyStep(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const _this$data2 = this.data,singleMaxQty = _this$data2.singleMaxQty,allowExceedMaxReportQty = _this$data2.allowExceedMaxReportQty;
    let next = parsePositiveInt(this.data.singleQuantity, 1) + delta;
    if (next < 0) next = 0;
    if (!allowExceedMaxReportQty && singleMaxQty > 0 && next > singleMaxQty) next = singleMaxQty;
    this.setData({ singleQuantity: String(next) });
    this.refreshCanSubmit();
  },

  onSingleDefectiveStep(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    let next = parseNonNegativeInt(this.data.singleDefectiveQty, 0) + delta;
    if (next < 0) next = 0;
    this.setData({ singleDefectiveQty: String(next) });
    this.refreshCanSubmit();
  },

  rebuildMatrixLayout(useFullBuild) {
    const matrixLayout = useFullBuild || !this.data.matrixLayout ?
    buildReportMatrixLayout(
      this._product,
      this._dictionaries,
      this._quantities,
      this._defectiveQuantities,
      this._layoutOpts
    ) :
    patchReportMatrixLayout(
      this.data.matrixLayout,
      this._quantities,
      this._defectiveQuantities,
      this._layoutOpts
    );
    const patch = { matrixLayout };
    if (this.data.activeMatrixVariantId) {
      const preview = buildMatrixKeyboardPreview(
        matrixLayout,
        this.data.activeMatrixVariantId,
        this.getActiveMatrixQtyMap()
      );
      patch.matrixKeyboardLabel = preview.label;
      patch.matrixKeyboardValue = preview.value;
    }
    this.setData(patch);
    this.refreshCanSubmit();
  },

  syncMatrixKeyboardPreview(variantId) {
    const id = variantId !== undefined ? variantId : this.data.activeMatrixVariantId;
    const preview = buildMatrixKeyboardPreview(this.data.matrixLayout, id, this.getActiveMatrixQtyMap());
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    });
  },

  getActiveMatrixQtyMap() {
    return this.data.qtyInputMode === 'defective' ? this._defectiveQuantities : this._quantities;
  },

  setActiveMatrixQty(variantId, value) {
    if (this.data.qtyInputMode === 'defective') {
      this._defectiveQuantities[variantId] = value;
    } else {
      this._quantities[variantId] = value;
    }
  },

  onMatrixCellTap(e) {
    const variantId = e.currentTarget.dataset.variantId;
    if (!variantId) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      this.data.matrixLayout,
      variantId,
      this.getActiveMatrixQtyMap()
    );
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    }, () => {
      afterMatrixKeyboardOpen(this, '.plan-create-scroll');
    });
  },

  onMatrixKeyboardAction(e) {
    const _ref2 = e.detail || {},action = _ref2.action,digit = _ref2.digit;
    if (action === 'confirm') {
      this.setData({
        matrixKeyboardVisible: false,
        matrixInputReplaceAll: false,
        activeMatrixVariantId: '',
        matrixKeyboardLabel: '',
        matrixKeyboardValue: ''
      });
      return;
    }
    const _this$data3 = this.data,activeMatrixVariantId = _this$data3.activeMatrixVariantId,matrixLayout = _this$data3.matrixLayout;
    const qtyMap = this.getActiveMatrixQtyMap();
    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(matrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, qtyMap);
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
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: ''
        });
      }
      return;
    }
    if (action === 'next') {
      const nextId = getNextMatrixVariantIdInColumn(matrixLayout, activeMatrixVariantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, qtyMap);
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
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: ''
        });
      }
      return;
    }
    if (!activeMatrixVariantId) return;
    const current = qtyMap[activeMatrixVariantId] || '';
    const _applyMatrixKeyboardK = applyMatrixKeyboardKey(this._matrixKbInput, current, action, digit),value = _applyMatrixKeyboardK.value,replaceConsumed = _applyMatrixKeyboardK.replaceConsumed;
    this.setActiveMatrixQty(activeMatrixVariantId, value);
    if (replaceConsumed) {
      this.setData({ matrixInputReplaceAll: false });
    }
    this.rebuildMatrixLayout();
  },

  onVariantRowQtyInput(e) {
    const index = e.currentTarget.dataset.index;
    const idx = Number(index);
    if (!Number.isFinite(idx)) return;
    const rows = (this.data.variantRows || []).slice();
    if (!rows[idx]) return;
    rows[idx] = { ...rows[idx], quantity: e.detail.value || '' };
    this.setData({ variantRows: rows });
    this.refreshCanSubmit();
  },

  onVariantRowDefectiveInput(e) {
    const index = e.currentTarget.dataset.index;
    const idx = Number(index);
    if (!Number.isFinite(idx)) return;
    const rows = (this.data.variantRows || []).slice();
    if (!rows[idx]) return;
    rows[idx] = { ...rows[idx], defectiveQty: e.detail.value || '' };
    this.setData({ variantRows: rows });
    this.refreshCanSubmit();
  },

  onCustomDataChange(e) {
    const customData = e.detail && e.detail.customData || {};
    this.setData({ customData });
    this.refreshCanSubmit();
  },

  onQtyModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'good' && mode !== 'defective') return;
    if (mode === this.data.qtyInputMode) return;
    this.setData({
      qtyInputMode: mode,
      matrixKeyboardVisible: false,
      matrixInputReplaceAll: false,
      activeMatrixVariantId: '',
      matrixKeyboardLabel: '',
      matrixKeyboardValue: ''
    });
    if (this.data.formMode === 'matrix') {
      this.rebuildMatrixLayout(true);
    }
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

  async onSubmit() {
    if (this.data.submitting || !this.data.canSubmit) return;

    const customErr = validateReportCustomFields(this._reportCustomFields, this.data.customData);
    if (customErr) {
      wx.showToast({ title: customErr, icon: 'none' });
      return;
    }

    if (!this.data.workerId) {
      wx.showToast({ title: '请选择生产人员', icon: 'none' });
      return;
    }
    if (this.data.needEquipment && !this.data.equipmentId) {
      wx.showToast({ title: '请选择设备', icon: 'none' });
      return;
    }

    const entries = buildSubmitEntries({
      formMode: this.data.formMode,
      singleQuantity: this.data.singleQuantity,
      singleDefectiveQty: this.data.singleDefectiveQty,
      variantId: this.data.variantId,
      quantities: this._quantities,
      defectiveQuantities: this._defectiveQuantities,
      variantRows: this.data.variantRows
    });

    if (!entries.length) {
      wx.showToast({ title: '请填写报工数量', icon: 'none' });
      return;
    }

    const totalGood = entries.reduce((s, e) => s + e.quantity, 0);
    const qtyErr = validateReportEntries(entries, {
      formMode: this.data.formMode,
      variantMaxGoodMap: this._variantMaxGoodMap,
      effectiveRemaining: this._reportHints && this._reportHints.hintRemaining,
      allowExceedMaxReportQty: this.data.allowExceedMaxReportQty,
      quantities: this._quantities,
      unitName: this.data.unitName
    });
    if (qtyErr) {
      wx.showToast({ title: qtyErr, icon: 'none' });
      return;
    }

    const _this$data4 = this.data,remaining = _this$data4.remaining,allowExceedMaxReportQty = _this$data4.allowExceedMaxReportQty;
    if (!allowExceedMaxReportQty && remaining > 0 && totalGood > remaining &&
    this.data.formMode !== 'matrix') {
      wx.showToast({ title: `良品最多可报 ${remaining} ${this.data.unitName}`, icon: 'none' });
      return;
    }

    const customData = buildCustomDataPayload(this._reportCustomFields, this.data.customData);
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const operator = this._tenantDisplayName || '';

    this.setData({ submitting: true });
    try {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const scanFields = buildReportScanPayloadFields(
          this._reportScanMeta,
          entry.variantId || null,
          customData || {},
        );
        await createOrderReport(this.data.orderId, this.data.milestoneId, {
          quantity: entry.quantity,
          defectiveQuantity: entry.defectiveQuantity > 0 ? entry.defectiveQuantity : undefined,
          variantId: entry.variantId || undefined,
          workerId: this.data.workerId,
          equipmentId: this.data.equipmentId || undefined,
          customData: scanFields.customData,
          reportBatchId: batchId,
          operator,
          itemCodeId: scanFields.itemCodeId,
          virtualBatchId: scanFields.virtualBatchId,
        });
      }
      wx.hideLoading();
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.PRODUCTION_ORDERS,
        toastTitle: '报工成功'
      });
    } catch (err) {
      wx.showToast({ title: err && err.message || '报工失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});