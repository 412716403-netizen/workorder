const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx,readOperatorDisplayName = _require.readOperatorDisplayName,readCurrentUserId = _require.readCurrentUserId;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission,hasPrefixPermission = _require2.hasPrefixPermission;
const _require3 =



  require('../../utils/productionPlans.js'),normalizeMasterList = _require3.normalizeMasterList,normalizeAppDictionaries = _require3.normalizeAppDictionaries,variantLabel = _require3.variantLabel;
const _require4 = require('../../utils/planFormCustomField.js'),getProductUnitName = _require4.getProductUnitName;
const _require5 =


















  require('../../utils/orderReportForm.js'),getEffectiveReportTemplate = _require5.getEffectiveReportTemplate,buildReportCustomFields = _require5.buildReportCustomFields,buildInitialReportCustomData = _require5.buildInitialReportCustomData,buildCustomDataPayload = _require5.buildCustomDataPayload,normalizeWorkersList = _require5.normalizeWorkersList,filterEntitiesForNode = _require5.filterEntitiesForNode,needEquipmentOnReport = _require5.needEquipmentOnReport,buildQtyHintText = _require5.buildQtyHintText,resolveReportFormMode = _require5.resolveReportFormMode,buildReportMatrixLayout = _require5.buildReportMatrixLayout,patchReportMatrixLayout = _require5.patchReportMatrixLayout,buildMultiVariantRows = _require5.buildMultiVariantRows,parseNonNegativeInt = _require5.parseNonNegativeInt,parsePositiveInt = _require5.parsePositiveInt,sumMatrixQuantities = _require5.sumMatrixQuantities,validateReportCustomFields = _require5.validateReportCustomFields,buildSubmitEntries = _require5.buildSubmitEntries,computeCanSubmit = _require5.computeCanSubmit;
const {
  getOrder,
  createOrderReport,
  createProductReport,
  fetchTenantConfig,
  fetchCategoriesAll,
  fetchNodesAll,
  fetchWorkersForReport,
  fetchProductionRecords,
  listOrdersPaginated,
  listProductProgressByProductId,
} = require('../../utils/orderApi.js');
const {
  computeProductReportHints,
  buildProductVariantMaxGoodMap,
  aggregateProductItems,
  fetchAllOrdersByProductId,
  buildSyntheticMilestone,
} = require('../utils/productReportHints.js');
const {
  fetchEquipmentAll,
  fetchDictionaries,
  getProduct,
} = require('../../utils/planApi.js');
const _require8 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require8.readNavBarMetrics,readWindowMetrics = _require8.readWindowMetrics,computePlanCreateHeaderHeight = _require8.computePlanCreateHeaderHeight;
const _require9 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require9.LIST_ROUTES,afterSaveReturnToList = _require9.afterSaveReturnToList;
const { defaultEntryDate, defaultEntryTimeHm, entryDateAndTimeToIso } = require('../../utils/docEntryTime.js');
const _require0 = require('../../utils/matrixKeyboardLayout.js'),afterMatrixKeyboardOpen = _require0.afterMatrixKeyboardOpen;
const _require1 = require('../utils/scanBatchController.js'),createScanBatchController = _require1.createScanBatchController;
const _require10 = require('../utils/scanBatchApplyReport.js'),createReportScanBatchHandlers = _require10.createReportScanBatchHandlers;
const _require13 = require('../utils/reportScanMeta.js'),resetReportScanMeta = _require13.resetReportScanMeta,buildReportScanPayloadFields = _require13.buildReportScanPayloadFields;
const _require14 = require('../../utils/featurePlugins.js'),loadTraceabilityScanEnabled = _require14.loadTraceabilityScanEnabled;
const {
  readWorkerReportScanPrefill,
  deserializeReportScanMeta,
} = require('../utils/workerReportScanPrefill.js');
const _requireWeight =
  require('../utils/bomWeightUsageLite.js'),roundWeightKg = _requireWeight.roundWeightKg,distributeWeightByQty = _requireWeight.distributeWeightByQty,calcUsageByWeightMultiVariant = _requireWeight.calcUsageByWeightMultiVariant,resolveBomForVariant = _requireWeight.resolveBomForVariant,buildWeightPreviewViewRows = _requireWeight.buildWeightPreviewViewRows;

function computeHeaderBlockHeight(nav) {
  return computePlanCreateHeaderHeight(nav);
}
const _require11 =






  require('../../utils/matrixQtyKeyboard.js'),activateMatrixKeyboardCell = _require11.activateMatrixKeyboardCell,applyMatrixKeyboardKey = _require11.applyMatrixKeyboardKey,buildMatrixKeyboardPreview = _require11.buildMatrixKeyboardPreview,createMatrixKeyboardInputSession = _require11.createMatrixKeyboardInputSession,getNextMatrixVariantIdInColumn = _require11.getNextMatrixVariantIdInColumn,getNextMatrixVariantIdInRow = _require11.getNextMatrixVariantIdInRow;
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
    totalRework: reportHints.totalRework,
    pendingApprovalQty: reportHints.pendingApprovalQty,
    reworkRemaining: reportHints.reworkRemainingQty,
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
    scanEnabled: false,
    /** 小程序 Tab 自报工：锁定本人 + requireApproval */
    selfReport: false,
    /** 产品模式：无工单号展示 */
    productReportMode: false,
    productId: '',
    milestoneTemplateId: '',
    entryDate: '',
    entryTime: '',
    /** 工序开启「报工时记录重量」时展示重量输入 + 预估物料消耗（对齐 Web ReportWeightBomSection） */
    weightReportEnabled: false,
    weightInput: '',
    weightPreviewRows: [],
    weightNoBomHint: false,
  },

  _quantities: {},
  _defectiveQuantities: {},

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._matrixKbInput = createMatrixKeyboardInputSession();
    const selfReport = options.selfReport === '1' || options.selfReport === 'true';
    const fromWorkerScan = options.fromWorkerScan === '1' || options.fromWorkerScan === 'true';
    const meId = readCurrentUserId();
    this._fromWorkerScan = fromWorkerScan;
    const orderId = options.orderId ? decodeURIComponent(options.orderId) : '';
    const milestoneId = options.milestoneId ? decodeURIComponent(options.milestoneId) : '';
    const productId = options.productId ? decodeURIComponent(options.productId) : '';
    const milestoneTemplateId = options.milestoneTemplateId
      ? decodeURIComponent(options.milestoneTemplateId)
      : '';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      orderId,
      milestoneId,
      productId,
      milestoneTemplateId,
      selfReport,
      workerId: selfReport && meId ? meId : '',
      workerName: selfReport ? (readOperatorDisplayName() || '本人') : '',
      entryDate: defaultEntryDate(),
      entryTime: defaultEntryTimeHm(),
    });

    const hasOrderParams = Boolean(orderId && milestoneId);
    const hasProductParams = Boolean(productId && milestoneTemplateId);
    if (!hasOrderParams && !hasProductParams) {
      wx.showToast({ title: '参数不完整', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    if (!selfReport) {
      const reportScan = createReportScanBatchHandlers(this);
      resetReportScanMeta(this);
      this._scanBatch = createScanBatchController(this, {
        title: '报工 · 批量扫码',
        showScanIntentToggle: true,
        resolveRowPreview: (payload) => reportScan.resolveRowPreview(payload),
        onConfirm: (payloads) => reportScan.onConfirm(payloads),
      });
      loadTraceabilityScanEnabled().then((scanEnabled) => {
        this.setData({ scanEnabled });
      });
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
    const perms = ctx.permissions || [];
    const canSelf =
      this.data.selfReport &&
      (hasPermission(perms, 'process_report') || hasPrefixPermission(perms, 'process_report'));
    const canOrderCenter = hasPermission(perms, 'production:orders_report_records:create');
    if (!canSelf && !canOrderCenter) {
      wx.showToast({ title: '无报工权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    const orderId = this.data.orderId;
    const milestoneId = this.data.milestoneId;
    const entryProductId = this.data.productId;
    const entryTemplateId = this.data.milestoneTemplateId;
    const ctx = readTenantCtx();
    try {
      const config = await fetchTenantConfig();
      const productionLinkMode =
        config && config.productionLinkMode === 'product' ? 'product' : 'order';
      const productEntry = Boolean(entryProductId && entryTemplateId && !orderId);
      const productReportMode = productionLinkMode === 'product' || productEntry;
      this._productionLinkMode = productionLinkMode;
      this._productReportMode = productReportMode;

      let order = null;
      let milestone = null;
      let productId = entryProductId;
      let blockOrders = [];
      let pmpList = [];
      let prodRecordsRaw = [];

      // 先解析 productId / 工单，再窄拉主数据（避免 products?all=true）
      if (productReportMode) {
        if (orderId) {
          order = await getOrder(orderId);
          if (!order) {
            wx.showToast({ title: '工单不存在', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 800);
            return;
          }
          milestone = (order.milestones || []).find((m) => m.id === milestoneId);
          if (!milestone) {
            wx.showToast({ title: '工序不存在', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 800);
            return;
          }
          productId = order.productId;
        } else {
          productId = entryProductId;
        }
      } else {
        order = await getOrder(orderId);
        if (!order) {
          wx.showToast({ title: '工单不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
        milestone = (order.milestones || []).find((m) => m.id === milestoneId);
        if (!milestone) {
          wx.showToast({ title: '工序不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
        productId = order.productId;
        blockOrders = [order];
      }

      const [
        productRaw,
        categoriesRaw,
        nodesRaw,
        workersRaw,
        equipmentRaw,
        dictionariesRaw,
        relatedOrders,
        pmpRaw,
        orderModeProdRecords,
      ] = await Promise.all([
        getProduct(productId).catch(() => null),
        fetchCategoriesAll(),
        fetchNodesAll(),
        fetchWorkersForReport(ctx && ctx.tenantId),
        fetchEquipmentAll(),
        fetchDictionaries(),
        productReportMode
          ? fetchAllOrdersByProductId(listOrdersPaginated, productId)
          : Promise.resolve([]),
        productReportMode
          ? listProductProgressByProductId(productId).catch(() => [])
          : Promise.resolve([]),
        productReportMode
          ? Promise.resolve([])
          : fetchProductionRecords({
              orderIds: orderId,
              types: 'OUTSOURCE,REWORK,REWORK_REPORT',
              all: 'true',
            }).catch(() => []),
      ]);

      const categories = normalizeMasterList(categoriesRaw);
      const globalNodes = normalizeMasterList(nodesRaw);
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);
      const product = productRaw || null;

      if (productReportMode) {
        if (!milestone) {
          milestone = buildSyntheticMilestone(entryTemplateId, '', globalNodes);
        }
        // 与 Web 工单中心一致：产品组统计含全部工单（不排除已发货）
        blockOrders = (relatedOrders || []).filter(Boolean);
        if (!blockOrders.length && order) blockOrders = [order];
        if (!blockOrders.length) {
          wx.showToast({ title: '该产品暂无在产工单', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
        if (!order) order = blockOrders[0];
        pmpList = Array.isArray(pmpRaw) ? pmpRaw : (pmpRaw && pmpRaw.data) || [];
        const orderIds = blockOrders.map((o) => o.id).join(',');
        prodRecordsRaw = await fetchProductionRecords({
          orderIds,
          productIds: productId,
          types: 'OUTSOURCE,REWORK,REWORK_REPORT',
          all: 'true',
        }).catch(() => []);
      } else {
        prodRecordsRaw = orderModeProdRecords || [];
      }

      const category =
        product && product.categoryId
          ? categories.find((c) => c.id === product.categoryId)
          : null;
      const templateId = milestone.templateId || entryTemplateId;
      if (!milestone.name && templateId) {
        const node = globalNodes.find((n) => n.id === templateId);
        if (node) milestone = { ...milestone, name: node.name || templateId, templateId };
      }

      const equipmentFeaturesEnabled =
        readTenantCtx() == null ? true : readTenantCtx().equipmentFeaturesEnabled !== false;
      const needEquipment = needEquipmentOnReport(
        globalNodes,
        templateId,
        equipmentFeaturesEnabled,
      );

      // 称重报工：工序开启 enableWeightOnReport 时展示重量录入 + 预估物料消耗
      const nodeForTemplate = globalNodes.find((n) => n.id === templateId);
      const weightReportEnabled = !!(nodeForTemplate && nodeForTemplate.enableWeightOnReport);
      this._weightReportEnabled = weightReportEnabled;
      this._boms = (product && product.boms) || [];
      this._materialNameById = {};

      const template = getEffectiveReportTemplate(milestone, globalNodes);
      const reportCustomFields = buildReportCustomFields(template);
      const customData = buildInitialReportCustomData(reportCustomFields, product);
      const unitName = getProductUnitName(product, dictionaries);
      const orderItems = productReportMode
        ? aggregateProductItems(blockOrders)
        : order.items || [];
      let formMode = resolveReportFormMode(product, category, orderItems);

      let reportHints;
      let variantMaxGoodMap;
      if (productReportMode) {
        reportHints = computeProductReportHints({
          blockOrders,
          pmp: pmpList,
          productId,
          milestoneTemplateId: templateId,
          product,
          globalNodes,
          config,
          prodRecords: prodRecordsRaw || [],
        });
        variantMaxGoodMap = buildProductVariantMaxGoodMap({
          blockOrders,
          pmp: pmpList,
          productId,
          milestoneTemplateId: templateId,
          product,
          reportHints,
          prodRecords: prodRecordsRaw || [],
        });
      } else {
        reportHints = computeOrderReportHints(
          order,
          milestone,
          globalNodes,
          config,
          prodRecordsRaw || [],
        );
        variantMaxGoodMap = buildVariantMaxGoodMap(
          order,
          milestone,
          product,
          reportHints.opts,
          prodRecordsRaw || [],
        );
      }

      const allowExceedMaxReportQty = !!(config && config.allowExceedMaxReportQty);
      const remaining = reportHints.hintRemaining;
      const layoutOpts = {
        variantMaxGoodMap,
        effectiveRemainingForModal: reportHints.effectiveRemainingForModal,
        allowExceedMaxReportQty,
      };

      const qtySummary =
        formMode === 'matrix'
          ? { show: false }
          : buildReportQtySummaryView(
              {
                totalQty: reportHints.hintTotalQty,
                maxReportable: reportHints.hintMaxReportable,
                reported: reportHints.hintCompletedDisplay,
                remaining: reportHints.hintRemaining,
                defective: reportHints.defectiveQtyForHint,
                totalOutsourcedAtNode: reportHints.totalOutsourcedAtNode,
                totalRework: reportHints.totalRework,
                pendingApprovalQty: reportHints.pendingApprovalQty,
                reworkRemaining: reportHints.reworkRemainingQty,
              },
              unitName,
            );
      const qtyHint = buildReportQtyHint(reportHints, unitName);

      const workersNormalized = normalizeWorkersList(workersRaw).filter(
        (w) => !w.status || w.status === 'ACTIVE',
      );
      const processNodes = globalNodes.map((n) => ({ id: n.id, name: n.name || n.id }));
      const equipment = needEquipment
        ? filterEntitiesForNode(equipmentRaw, templateId)
        : [];
      const equipmentNames = equipment.map((e) => e.name || e.code || e.id);

      this._order = order;
      this._blockOrders = blockOrders;
      this._pmpList = pmpList;
      this._orderItems = orderItems;
      this._milestone = milestone;
      this._product = product;
      this._productId = productId;
      this._milestoneTemplateId = templateId;
      this._category = category;
      this._dictionaries = dictionaries;
      this._reportCustomFields = reportCustomFields;
      this._variantMaxGoodMap = variantMaxGoodMap;
      this._reportHints = reportHints;
      this._layoutOpts = layoutOpts;
      this._tenantDisplayName = readOperatorDisplayName();

      this._quantities = {};
      this._defectiveQuantities = {};

      const prefill = this._fromWorkerScan ? readWorkerReportScanPrefill() : null;
      const prefillOk =
        prefill &&
        ((prefill.orderId === orderId && prefill.milestoneId === milestoneId) ||
          (prefill.productId === productId &&
            prefill.milestoneTemplateId === templateId));
      if (prefillOk) {
        this._quantities = { ...(prefill.quantities || {}) };
        this._defectiveQuantities = { ...(prefill.defectiveQuantities || {}) };
        if (prefill.scanMeta) {
          this._reportScanMeta = deserializeReportScanMeta(prefill.scanMeta);
        }
      }

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
          layoutOpts,
          orderItems,
        );
        if (!matrixLayout) {
          formMode = 'multi';
          matrixLayout = null;
        }
      }
      if (formMode === 'multi' && product) {
        variantRows = buildMultiVariantRows(
          product,
          category,
          dictionaries,
          orderItems,
          this._quantities,
          this._defectiveQuantities,
          variantMaxGoodMap,
          unitName,
        );
        if (!variantRows.length) {
          formMode = 'single';
        }
      }
      if (formMode === 'single') {
        const uniqueVariantIds = [
          ...new Set(orderItems.map((it) => it.variantId).filter(Boolean)),
        ];
        if (uniqueVariantIds.length === 1) {
          variantId = uniqueVariantIds[0];
        } else if (uniqueVariantIds.length > 1) {
          variantOptions = uniqueVariantIds.map((vid) => {
            const variant =
              ((product && product.variants) || []).find((v) => v.id === vid);
            return {
              id: vid,
              label: variant ? variantLabel(variant, dictionaries) : vid,
            };
          });
          variantId = variantOptions[0].id;
          variantLabelText = variantOptions[0].label;
        }
        if (prefillOk) {
          const vid = variantId || '';
          const fromPrefill = this._quantities[vid] ?? this._quantities[''];
          if (fromPrefill != null && fromPrefill !== '') {
            singleQuantity = String(fromPrefill);
          }
        }
      }

      const singleMaxQty =
        formMode === 'single'
          ? getSingleMaxQty(
              variantMaxGoodMap,
              variantId,
              reportHints.effectiveRemainingForModal,
              allowExceedMaxReportQty,
            )
          : 0;
      const singleMaxQtyLabel =
        singleMaxQty > 0 ? `最多 ${singleMaxQty} ${unitName}` : '';

      const statePatch = {
        loading: false,
        productReportMode,
        productId: productId || '',
        milestoneTemplateId: templateId || '',
        orderNumber: productReportMode ? '' : order.orderNumber || '',
        productName:
          (product && product.name) ||
          order.productName ||
          '',
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
        currentNodeId: templateId,
        workerId: this.data.selfReport
          ? this.data.workerId || readCurrentUserId()
          : '',
        workerName: this.data.selfReport
          ? this.data.workerName || readOperatorDisplayName() || '本人'
          : '',
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
        qtyInputMode: 'good',
        weightReportEnabled,
      };

      this.setData(statePatch);
      this.refreshCanSubmit();
      if (weightReportEnabled) this.loadWeightMaterialNames();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
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
    this.refreshWeightPreview();
  },

  /** 称重工序：BOM 子物料名称（仅本工序 BOM 涉及的少量物料，逐个窄拉） */
  async loadWeightMaterialNames() {
    const nodeId = this._milestoneTemplateId || this.data.milestoneTemplateId;
    const ids = new Set();
    (this._boms || []).forEach((b) => {
      if (!b || b.nodeId !== nodeId) return;
      (b.items || []).forEach((it) => {
        if (it && it.productId) ids.add(it.productId);
      });
    });
    if (!ids.size) return;
    const list = await Promise.all(
      [...ids].map((id) => getProduct(id).catch(() => null)),
    );
    const nameById = {};
    list.forEach((p) => {
      if (p && p.id) nameById[p.id] = p.name || '';
    });
    this._materialNameById = nameById;
    this.refreshWeightPreview();
  },

  /** 良品数量或重量变化后重算预估物料消耗（多规格合并，对齐 Web） */
  refreshWeightPreview() {
    if (!this._weightReportEnabled) return;
    const weightKg = roundWeightKg(Number(this.data.weightInput) || 0);
    const entries = buildSubmitEntries({
      formMode: this.data.formMode,
      singleQuantity: this.data.singleQuantity,
      singleDefectiveQty: this.data.singleDefectiveQty,
      variantId: this.data.variantId,
      quantities: this._quantities,
      defectiveQuantities: this._defectiveQuantities,
      variantRows: this.data.variantRows
    }).filter((e) => e.quantity > 0);

    let viewRows = [];
    let noBomHint = false;
    if (weightKg > 0 && entries.length > 0) {
      const nodeId = this._milestoneTemplateId || this.data.milestoneTemplateId;
      const productId = this._productId || this.data.productId;
      const nameById = this._materialNameById || {};
      const parts = entries.map((e) => ({
        bom: resolveBomForVariant(this._boms, productId, nodeId, e.variantId),
        quantity: e.quantity
      }));
      const rows = calcUsageByWeightMultiVariant(parts, weightKg, (pid) => nameById[pid] || '');
      viewRows = buildWeightPreviewViewRows(rows);
      noBomHint = viewRows.length === 0;
    }
    const same =
      JSON.stringify(viewRows) === JSON.stringify(this.data.weightPreviewRows) &&
      noBomHint === this.data.weightNoBomHint;
    if (!same) {
      this.setData({ weightPreviewRows: viewRows, weightNoBomHint: noBomHint });
    }
  },

  onWeightInput(e) {
    this.setData({ weightInput: (e.detail && e.detail.value) || '' });
    this.refreshWeightPreview();
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
      this._layoutOpts,
      this._orderItems || (this._order && this._order.items) || [],
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

  onEntryDateChange(e) {
    this.setData({ entryDate: (e.detail && e.detail.value) || '' });
  },

  onEntryTimeChange(e) {
    this.setData({ entryTime: (e.detail && e.detail.value) || '' });
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
    const timestamp = entryDateAndTimeToIso(this.data.entryDate, this.data.entryTime);

    // 称重工序：总重按良品数量分摊到各规格条目（对齐 Web distributeWeightByQty），后端按 variant BOM 固化 materialBreakdown
    const weightByEntryIndex = {};
    if (this._weightReportEnabled) {
      const totalWeightKg = roundWeightKg(Number(this.data.weightInput) || 0);
      const goodIdx = [];
      entries.forEach((e, i) => {
        if (e.quantity > 0) goodIdx.push(i);
      });
      if (totalWeightKg > 0 && goodIdx.length > 0) {
        const parts = distributeWeightByQty(
          totalWeightKg,
          goodIdx.map((i) => ({ quantity: entries[i].quantity })),
        );
        goodIdx.forEach((entryIdx, j) => {
          if (parts[j] > 0) weightByEntryIndex[entryIdx] = parts[j];
        });
      }
    }

    this.setData({ submitting: true });
    try {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const scanFields = buildReportScanPayloadFields(
          this._reportScanMeta,
          entry.variantId || null,
          customData || {},
        );
        const commonBody = {
          quantity: entry.quantity,
          defectiveQuantity: entry.defectiveQuantity > 0 ? entry.defectiveQuantity : undefined,
          weight: weightByEntryIndex[i] > 0 ? weightByEntryIndex[i] : undefined,
          variantId: entry.variantId || undefined,
          workerId: this.data.workerId,
          equipmentId: this.data.equipmentId || undefined,
          customData: scanFields.customData,
          reportBatchId: batchId,
          operator,
          timestamp,
          itemCodeId: scanFields.itemCodeId,
          virtualBatchId: scanFields.virtualBatchId,
          requireApproval: this.data.selfReport ? true : undefined,
        };
        if (this._productReportMode) {
          await createProductReport({
            productId: this._productId || this.data.productId,
            milestoneTemplateId:
              this._milestoneTemplateId || this.data.milestoneTemplateId,
            ...commonBody,
          });
        } else {
          await createOrderReport(this.data.orderId, this.data.milestoneId, commonBody);
        }
      }
      wx.hideLoading();
      if (this.data.selfReport) {
        wx.showToast({ title: '已提交，待审核', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/scan/scan' });
        }, 400);
      } else {
        afterSaveReturnToList({
          listUrl: LIST_ROUTES.PRODUCTION_ORDERS,
          toastTitle: '报工成功',
        });
      }
    } catch (err) {
      wx.showToast({ title: err && err.message || '报工失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});