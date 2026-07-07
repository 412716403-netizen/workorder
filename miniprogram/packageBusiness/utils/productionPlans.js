const {
  PlanDispatchStatus,
  PLAN_DISPATCH_STATUS_LABEL,
  PLAN_DISPATCH_STATUS_BY_LABEL,
  PLAN_STATUS_LABEL,
  PRIORITY_LABEL,
  PlanStatus,
} = require('../config/productionPlans.js');
const { normalizeListBody } = require('../../utils/listResponse.js');
const { mapProductCustomTags } = require('./reportCustomDocField.js');
const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
const { localTodayYmd } = require('./dateYmd.js');
const {
  customerShowInDetail,
  standardFieldShowInDetail,
  buildPlanDetailCustomFields,
  customFieldDisplayValue,
  getProductUnitName,
  normalizePlanFormFieldConfigArray,
} = require('./planFormCustomField.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON, productNameSkuParts } = require('./listProductThumb.js');

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatPlanDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const s = String(iso).slice(0, 10);
    return s.length === 10 ? s : String(iso);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatPlanListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return formatPlanDate(iso);
}

/**
 * 解析计划单列表搜索框（对齐 utils/parsePlanSearch.ts）
 */
function parsePlanSearch(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { search: '' };
  const matched = PLAN_DISPATCH_STATUS_BY_LABEL[trimmed];
  if (matched) return { search: '', dispatchStatus: matched };
  return { search: trimmed };
}

function dispatchStatusPillClass(status) {
  switch (status) {
    case PlanDispatchStatus.COMPLETED:
      return 'st-pill--info';
    case PlanDispatchStatus.IN_PROGRESS:
      return 'st-pill--pending';
    case PlanDispatchStatus.NOT_DISPATCHED:
    default:
      return 'st-pill--muted';
  }
}

function dispatchStatusLabel(status) {
  return PLAN_DISPATCH_STATUS_LABEL[status] || PLAN_DISPATCH_STATUS_LABEL.NOT_DISPATCHED;
}

function computePurchaseProgressPct(received, ordered) {
  const o = Number(ordered ?? 0);
  const r = Number(received ?? 0);
  if (!(o > 0)) return null;
  return Math.min(100, Math.round((r / o) * 100));
}

/** 列表采购进度文案（对齐 Web PlanOrderListView.renderPlanListPurchaseProgress） */
function planListPurchaseProgressMeta(purchaseProgress, pct) {
  if (pct == null || !purchaseProgress) {
    return {
      progressLabel: '',
      progressComplete: false,
      progressOverReceived: false,
      progressOrderedBarPct: 0,
      progressOverBarPct: 0,
    };
  }
  const ordered = Number(purchaseProgress.ordered) || 0;
  const received = Number(purchaseProgress.received) || 0;
  const progressOverReceived = ordered > 0 && received > ordered;
  const progressComplete = pct >= 100 && !progressOverReceived;
  let progressLabel;
  if (progressOverReceived) progressLabel = '采购已超收';
  else if (progressComplete) progressLabel = '采购已完成';
  else progressLabel = `采购 ${pct}%`;

  let progressOrderedBarPct = pct;
  let progressOverBarPct = 0;
  if (progressOverReceived && received > 0) {
    progressOrderedBarPct = Math.round((ordered / received) * 100);
    progressOverBarPct = 100 - progressOrderedBarPct;
  }

  return {
    progressLabel,
    progressComplete,
    progressOverReceived,
    progressOrderedBarPct,
    progressOverBarPct,
  };
}

function planNumbersWithAncestors(plan, planById) {
  const nums = [plan.planNumber];
  let current = plan;
  const seen = new Set([plan.id]);
  while (current && current.parentPlanId) {
    const parent = planById.get(current.parentPlanId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    nums.push(parent.planNumber);
    current = parent;
  }
  return nums;
}

function buildPurchaseProgressRequest(plans) {
  const planById = new Map((plans || []).map((p) => [p.id, p]));
  return (plans || [])
    .filter((p) => p && p.id)
    .map((p) => ({
      planId: p.id,
      planNumbers: planNumbersWithAncestors(p, planById),
    }));
}

function sumPlanQuantity(items) {
  return (items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
}

function productColorSizeEnabled(product, category) {
  return (
    Boolean(product && product.colorIds && product.colorIds.length && product.sizeIds && product.sizeIds.length)
    || Boolean(category && category.hasColorSize)
  );
}

function productHasColorSizeMatrix(product, category) {
  const n = (product && product.variants && product.variants.length) || 0;
  if (n < 1) return false;
  return productColorSizeEnabled(product, category) || n > 1;
}

/** 归一化 /master/dictionaries 响应为 { colors, sizes, units } */
function normalizeAppDictionaries(body) {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    if (Array.isArray(body.colors) || Array.isArray(body.sizes)) {
      return {
        colors: Array.isArray(body.colors) ? body.colors : [],
        sizes: Array.isArray(body.sizes) ? body.sizes : [],
        units: Array.isArray(body.units) ? body.units : [],
      };
    }
  }
  const list = normalizeListBody(body);
  if (list.length) {
    return {
      colors: list.filter((i) => i.type === 'color'),
      sizes: list.filter((i) => i.type === 'size'),
      units: list.filter((i) => i.type === 'unit'),
    };
  }
  return { colors: [], sizes: [], units: [] };
}

function dictName(list, id) {
  if (!id) return '';
  const item = (list || []).find((x) => x.id === id);
  return item && item.name ? String(item.name) : '';
}

function variantLabel(variant, dictionaries) {
  if (!variant) return '规格';
  const colors = (dictionaries && dictionaries.colors) || [];
  const sizes = (dictionaries && dictionaries.sizes) || [];
  const colorName = dictName(colors, variant.colorId);
  const sizeName = dictName(sizes, variant.sizeId);
  const parts = [colorName, sizeName].filter(Boolean);
  if (parts.length) return parts.join(' / ');
  if (variant.skuSuffix) return String(variant.skuSuffix);
  return variant.id || '规格';
}

/** 无产品图时占位图标（对齐 Web PlanOrderListView：CONVERTED→勾选，否则时钟） */
function planListPlaceholderIcon(plan) {
  return plan && plan.status === PlanStatus.CONVERTED ? 'circle-check' : 'clock';
}

function planListPlaceholderIconSrc(plan) {
  const name = planListPlaceholderIcon(plan);
  return `/assets/icons/${name}.png`;
}

function formatProductLabelWithSku(product) {
  const parts = productNameSkuParts(product);
  if (parts.showSku) return `${parts.name} ${parts.sku}`;
  return parts.name;
}

/**
 * 列表行 UI 模型
 */
function mapPlanListRow(
  plan,
  {
    productName = '',
    productSku = '',
    showProductSku,
    productImageUrl = '',
    productCustomTags = [],
    categoryLabel = '',
    purchaseProgress,
    showDeliveryDate = true,
  } = {},
) {
  const status = plan.derivedStatus || PlanDispatchStatus.NOT_DISPATCHED;
  const pct = purchaseProgress
    ? computePurchaseProgressPct(purchaseProgress.received, purchaseProgress.ordered)
    : null;
  const customer = plan.customer || '';
  const dueDateLabel = showDeliveryDate && plan.dueDate
    ? `交期 ${formatPlanDate(plan.dueDate)}`
    : '';
  const qty = sumPlanQuantity(plan.items);
  const createdAtText = formatPlanListTime(plan.createdAt);
  const progressMeta = planListPurchaseProgressMeta(purchaseProgress, pct);

  return {
    id: plan.id,
    planNumber: plan.planNumber || '',
    productName: productName || '—',
    productSku: productSku || '',
    showProductSku: showProductSku != null
      ? !!showProductSku
      : Boolean(String(productSku || '').trim() && productName && productSku !== productName),
    productImageUrl: productImageUrl || '',
    showProductImage: Boolean(String(productImageUrl || '').trim()),
    productCustomTags: productCustomTags || [],
    showProductCustomTags: (productCustomTags || []).length > 0,
    categoryLabel: categoryLabel || '',
    showCategoryLabel: Boolean(String(categoryLabel || '').trim()),
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    customer,
    showCustomer: Boolean(customer),
    dueDateText: plan.dueDate ? formatPlanDate(plan.dueDate) : '',
    dueDateLabel,
    showDueDate: Boolean(dueDateLabel),
    showSubRow: Boolean(customer || dueDateLabel),
    createdAtText,
    showCreatedAt: Boolean(createdAtText),
    quantityText: qty > 0 ? `${qty} 件` : '',
    showQuantity: qty > 0,
    dispatchLabel: dispatchStatusLabel(status),
    dispatchPillClass: dispatchStatusPillClass(status),
    progressPct: pct,
    progressLabel: progressMeta.progressLabel,
    progressComplete: progressMeta.progressComplete,
    progressOverReceived: progressMeta.progressOverReceived,
    progressOrderedBarPct: progressMeta.progressOrderedBarPct,
    progressOverBarPct: progressMeta.progressOverBarPct,
    showProgress: pct != null,
  };
}

function buildAssignmentRows(plan, { nodes = [], equipment = [] } = {}) {
  const assignments = plan.assignments || {};
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const equipById = new Map(equipment.map((e) => [e.id, e]));
  const rows = [];

  Object.keys(assignments).forEach((nodeId) => {
    const node = nodeById.get(nodeId);
    const a = assignments[nodeId] || {};
    const workerCount = (a.workerIds || []).length;
    const equipNames = (a.equipmentIds || [])
      .map((id) => {
        const eq = equipById.get(id);
        return eq ? eq.name : id;
      })
      .filter(Boolean);
    const parts = [];
    if (workerCount > 0) parts.push(`工人 ${workerCount} 人`);
    if (equipNames.length) parts.push(`设备 ${equipNames.join('、')}`);
    rows.push({
      label: node ? node.name : nodeId,
      value: parts.length ? parts.join(' · ') : '未分配',
    });
  });

  return rows;
}

function buildQuantityRows(plan, product, { category, dictionaries } = {}) {
  const items = plan.items || [];
  if (!items.length) return [{ label: '计划数量', value: '—' }];

  const useMatrix = productHasColorSizeMatrix(product, category);
  if (!useMatrix || !(product && product.variants && product.variants.length)) {
    const total = sumPlanQuantity(items);
    return [{ label: '计划数量', value: `${total} 件` }];
  }

  const variantById = new Map((product.variants || []).map((v) => [v.id, v]));
  return items.map((it, idx) => {
    const variant = it.variantId ? variantById.get(it.variantId) : null;
    return {
      label: variant ? variantLabel(variant, dictionaries) : `规格 ${idx + 1}`,
      value: `${Number(it.quantity) || 0} 件`,
    };
  });
}

/**
 * 详情分区（section-card 用）
 */
function mapPlanDetailSections(
  plan,
  {
    product,
    category,
    dictionaries,
    nodes = [],
    equipment = [],
    planRelated,
    purchaseProgress,
    productionLinkMode = 'order',
    showDeliveryDate = true,
  } = {},
) {
  const sections = [];
  const status = plan.derivedStatus || PlanDispatchStatus.NOT_DISPATCHED;
  const basicRows = [
    { label: '计划单号', value: plan.planNumber || '—' },
    { label: '产品', value: formatProductLabelWithSku(product) },
    { label: '客户', value: plan.customer || '—' },
  ];
  if (showDeliveryDate) {
    basicRows.push({ label: '交货日期', value: plan.dueDate ? formatPlanDate(plan.dueDate) : '—' });
  }
  basicRows.push(
    { label: '优先级', value: PRIORITY_LABEL[plan.priority] || plan.priority || '—' },
    { label: '单据状态', value: PLAN_STATUS_LABEL[plan.status] || plan.status || '—' },
    { label: '创建日期', value: plan.createdAt ? formatPlanDate(plan.createdAt) : '—' },
  );
  if (productionLinkMode === 'order') {
    basicRows.push({
      label: '派发状态',
      value: dispatchStatusLabel(status),
    });
  }
  sections.push({ id: 'basic', title: '基本信息', rows: basicRows });

  const qtyRows = buildQuantityRows(plan, product, { category, dictionaries });
  sections.push({ id: 'quantity', title: '生产数量', rows: qtyRows });

  const assignRows = buildAssignmentRows(plan, { nodes, equipment });
  if (assignRows.length) {
    sections.push({ id: 'assignments', title: '工序派发', rows: assignRows });
  }

  const poCount = (planRelated && planRelated.purchaseOrders && planRelated.purchaseOrders.length) || 0;
  const pct = purchaseProgress
    ? computePurchaseProgressPct(purchaseProgress.received, purchaseProgress.ordered)
    : null;
  if (poCount > 0 || pct != null) {
    const purchaseRows = [{ label: '关联采购订单', value: `${poCount} 张` }];
    if (pct != null) {
      purchaseRows.push({
        label: '到货进度',
        value: `${pct}%${purchaseProgress && Number(purchaseProgress.received) > Number(purchaseProgress.ordered) ? '（超收）' : ''}`,
      });
    }
    sections.push({ id: 'purchase', title: '采购进度', rows: purchaseRows });
  }

  return sections;
}

function markLastRows(rows) {
  rows.forEach((row, index) => {
    row.isLast = index === rows.length - 1;
  });
  return rows;
}

function buildPlanQtyMap(plan) {
  const qtyMap = {};
  (plan.items || []).forEach((it) => {
    if (it.variantId) qtyMap[it.variantId] = Number(it.quantity) || 0;
  });
  return qtyMap;
}

function planFormFieldLabel(planFormSettings, fieldId, defaultLabel) {
  const fields = normalizePlanFormFieldConfigArray(
    planFormSettings && planFormSettings.standardFields,
  );
  const field = fields.find((f) => f.id === fieldId);
  return (field && field.label) || defaultLabel;
}

/**
 * 详情页 UI 模型（对齐 Web PlanDetailPanel 五个分区）
 */
function mapPlanDetailView(
  plan,
  {
    product,
    category,
    dictionaries,
    nodes = [],
    equipment = [],
    workers = [],
    boms = [],
    products = [],
    categories = [],
    allPlans = [],
    stockMap = {},
    stockReady = false,
    planRelated,
    planNumbersForPO = [],
    productionLinkMode = 'order',
    showDeliveryDate = true,
    planFormSettings = {},
    planWorkOrdersDispatched = false,
    materialLoading = false,
    materialLoadError = '',
  } = {},
) {
  const { buildPlanProcessNodes } = require('./planDetailProcess.js');
  const { computePlanMaterialRequirements } = require('./planDetailMaterial.js');
  const { formatPlanCreatedDateList } = require('./planDetailHelpers.js');

  const sections = [];
  const productParts = productNameSkuParts(product);
  const productImageUrl = product && product.imageUrl ? String(product.imageUrl) : '';
  const unitName = getProductUnitName(product, dictionaries);
  const productCustomTags = mapProductCustomTags(product, category, { includeFile: false });
  const useMatrix = productHasColorSizeMatrix(product, category)
    && product
    && product.variants
    && product.variants.length;
  const totalQuantity = sumPlanQuantity(plan.items);
  let matrixLayout = null;
  if (useMatrix) {
    matrixLayout = buildVariantMatrixUiModel(product, dictionaries, buildPlanQtyMap(plan));
  }

  const productHero = {
    planNumber: plan.planNumber || '—',
    productName: productParts.name,
    productSku: productParts.sku,
    showProductSku: productParts.showSku,
    productImageUrl,
    showProductImage: Boolean(productImageUrl),
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    productCustomTags,
    showProductCustomTags: productCustomTags.length > 0,
  };

  const basicRows = [];
  if (standardFieldShowInDetail(planFormSettings, 'planNumber', true)) {
    basicRows.push({
      type: 'text',
      label: '单据号',
      value: plan.planNumber || '—',
    });
  }
  if (standardFieldShowInDetail(planFormSettings, 'createdAt', true)) {
    basicRows.push({
      type: 'text',
      label: planFormFieldLabel(planFormSettings, 'createdAt', '创建时间'),
      value: formatPlanCreatedDateList(plan.createdAt) || '—',
    });
  }
  if (showDeliveryDate) {
    basicRows.push({
      type: 'text',
      label: '交货日期',
      value: plan.dueDate ? formatPlanDate(plan.dueDate) : '—',
    });
  }
  if (customerShowInDetail(planFormSettings, productionLinkMode)) {
    basicRows.push({
      type: 'text',
      label: '计划客户（合作单位）',
      value: plan.customer || '—',
    });
  }
  buildPlanDetailCustomFields(planFormSettings).forEach((field) => {
    const val = customFieldDisplayValue(field, plan.customData);
    basicRows.push({
      type: 'text',
      label: field.label,
      value: field.desktopOnly ? (val || '请在电脑端查看') : (val || '—'),
      muted: field.desktopOnly && !val,
    });
  });
  if (basicRows.length) {
    markLastRows(basicRows);
    sections.push({ id: 'basic', title: '1. 计划基础信息', rows: basicRows });
  }

  const qtySection = {
    id: 'quantity',
    title: '2. 生产数量明细',
    subtitle: planWorkOrdersDispatched ? '（已下达工单，不可改）' : '',
    kind: useMatrix && matrixLayout ? 'matrix' : 'total',
    unitName,
    totalQuantity,
    showTotal: totalQuantity > 0,
    matrixLayout,
    totalText: totalQuantity > 0 ? String(totalQuantity) : '0',
  };
  sections.push(qtySection);

  const processNodes = buildPlanProcessNodes(
    product,
    nodes,
    plan.assignments,
    product && product.nodeRates,
    workers,
    equipment,
  );
  sections.push({
    id: 'process',
    title: '3. 工序任务',
    nodes: processNodes,
    emptyText: processNodes.length ? '' : '该产品未配置工序路线',
  });

  const materialLossEnabled = Boolean(
    planFormSettings.listDisplay && planFormSettings.listDisplay.materialLossEnabled,
  );
  const materialSectionBase = {
    id: 'material',
    title: '4. 计划生产用料清单 (BOM 汇总)',
    materialLossEnabled,
    tableMinWidth: materialLossEnabled ? 1360 : 1240,
  };
  if (materialLoading) {
    sections.push({
      ...materialSectionBase,
      loading: true,
      materials: [],
      emptyText: '',
    });
  } else if (materialLoadError) {
    sections.push({
      ...materialSectionBase,
      loading: false,
      loadError: materialLoadError,
      materials: [],
      emptyText: '',
    });
  } else {
    const getUnitName = (productId) => {
      const p = products.find((x) => x.id === productId) || (product && productId === product.id ? product : null);
      return getProductUnitName(p, dictionaries);
    };
    const materials = computePlanMaterialRequirements({
      plan,
      product,
      items: plan.items || [],
      boms,
      products,
      categories,
      globalNodes: nodes,
      stockMap,
      stockReady,
      plans: allPlans,
      planNumbersForPO,
      planRelated: planRelated || {},
      materialLossEnabled,
      customData: plan.customData,
      plannedQtyByKey: {},
      getUnitName,
    });
    sections.push({
      ...materialSectionBase,
      loading: false,
      materials,
      emptyText: materials.length ? '' : '尚未配置 BOM 详情',
    });
  }

  return {
    productHero,
    sections,
    planWorkOrdersDispatched,
  };
}

function normalizeMasterList(body) {
  return normalizeListBody(body);
}

function canConvertPlan(plan) {
  if (!plan) return false;
  const status = plan.derivedStatus || PlanDispatchStatus.NOT_DISPATCHED;
  return status === PlanDispatchStatus.NOT_DISPATCHED;
}

module.exports = {
  parsePlanSearch,
  dispatchStatusPillClass,
  dispatchStatusLabel,
  computePurchaseProgressPct,
  planListPurchaseProgressMeta,
  planNumbersWithAncestors,
  buildPurchaseProgressRequest,
  sumPlanQuantity,
  productHasColorSizeMatrix,
  productColorSizeEnabled,
  variantLabel,
  mapPlanListRow,
  mapPlanDetailSections,
  mapPlanDetailView,
  buildAssignmentRows,
  buildQuantityRows,
  formatPlanDate,
  formatPlanListTime,
  localTodayYmd,
  normalizeMasterList,
  normalizeAppDictionaries,
  canConvertPlan,
  planListPlaceholderIcon,
  planListPlaceholderIconSrc,
  productNameSkuParts,
  formatProductLabelWithSku,
};
