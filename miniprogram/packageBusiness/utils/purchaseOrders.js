/**
 * 采购订单 view-model（对齐 Web PSIOpsView / PsiDocDetailSummary）
 */

const {
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER,
  PURCHASE_ORDER_FLOW_STATUS_PILL,
} = require('../config/purchaseOrders.js');
const {
  groupRecordsByDocNumber,
  purchaseOrderDocHasUnsettled,
  groupDocItemsByLineGroup,
  lineGroupTotalQty,
  lineGroupTotalAmount,
  formatPsiQtyDisplay,
} = require('./psiOpsAggregators.js');
const { flowRecordsEarliestMs, formatLocalDateTimeZh } = require('./flowDocSortLite.js');
const { formatReportTime } = require('./orderReportHistory.js');
const { listProductDisplayFieldsFromMap } = require('./listProductThumb.js');
const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
const { productHasColorSizeMatrix } = require('./productionPlans.js');
const { getProductUnitName } = require('./planFormCustomField.js');

function parsePurchaseOrderSearch(raw) {
  const search = String(raw || '').trim();
  return { search };
}

function formatPsiDocNumForList(docNumber) {
  const s = String(docNumber || '').trim();
  if (!s) return '—';
  return s;
}

function formatPsiDocBusinessDateListZh(docLines) {
  const ms = flowRecordsEarliestMs(docLines);
  if (ms <= 0) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readSourcePlanNumber(items) {
  const first = (items || [])[0];
  const cd = first && first.customData && typeof first.customData === 'object' ? first.customData : {};
  return String(cd[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER] || '').trim();
}

function docReceivedQty(docNumber, items, receivedByOrderLine) {
  return (items || []).reduce(
    (s, i) => s + (receivedByOrderLine[`${docNumber}::${i.id}`] || 0),
    0,
  );
}

function docOrderedQty(items) {
  return (items || []).reduce((s, i) => s + formatPsiQtyDisplay(i.quantity), 0);
}

function inboundProgressMeta(ordered, received) {
  if (ordered <= 0) {
    return {
      progressLabel: '',
      progressComplete: false,
      progressOverReceived: false,
      progressOrderedBarPct: 0,
      progressOverBarPct: 0,
      showProgress: false,
      receivedText: '0',
      orderedText: '0',
    };
  }
  const progressOverReceived = received > ordered;
  const progressComplete = received >= ordered && !progressOverReceived;
  let progressLabel;
  if (progressOverReceived) progressLabel = '已超收';
  else if (progressComplete) progressLabel = '已入库';
  else if (received > 0) progressLabel = `${Math.round((received / ordered) * 100)}%`;
  else progressLabel = '未入库';

  let progressOrderedBarPct = Math.min(100, Math.round((received / ordered) * 100));
  let progressOverBarPct = 0;
  if (progressOverReceived && received > 0) {
    progressOrderedBarPct = Math.round((ordered / received) * 100);
    progressOverBarPct = 100 - progressOrderedBarPct;
  }

  return {
    progressLabel,
    progressShortText: `${received}/${ordered}`,
    progressComplete,
    progressOverReceived,
    progressOrderedBarPct,
    progressOverBarPct,
    showProgress: true,
    receivedText: String(received),
    orderedText: String(ordered),
  };
}

function resolvePurchaseOrderLineFlowStatus(docNumber, items, receivedByOrderLine) {
  const orderQty = lineGroupTotalQty(items);
  const received = (items || []).reduce(
    (s, i) => s + (receivedByOrderLine[`${docNumber}::${i.id}`] || 0),
    0,
  );
  if (orderQty > 0 && received > orderQty) {
    return { statusKey: 'over_received', statusLabel: '已超收', pillClass: PURCHASE_ORDER_FLOW_STATUS_PILL.over_received };
  }
  if (orderQty > 0 && received >= orderQty) {
    return { statusKey: 'completed', statusLabel: '已入库', pillClass: PURCHASE_ORDER_FLOW_STATUS_PILL.completed };
  }
  if (received > 0) {
    return { statusKey: 'partial', statusLabel: '部分入库', pillClass: PURCHASE_ORDER_FLOW_STATUS_PILL.partial };
  }
  return { statusKey: 'none', statusLabel: '未入库', pillClass: PURCHASE_ORDER_FLOW_STATUS_PILL.none };
}

function docFullyReceived(docNumber, items, receivedByOrderLine) {
  if (!items || !items.length) return false;
  return !purchaseOrderDocHasUnsettled(docNumber, items, receivedByOrderLine);
}

function docMatchesSearch(docNumber, items, keyword, productMap) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return true;
  const first = items[0] || {};
  const fields = [
    docNumber,
    first.partner,
    first.operator,
    first.note,
  ];
  if (readSourcePlanNumber(items)) fields.push(readSourcePlanNumber(items));
  (items || []).forEach((r) => {
    const product = productMap && r.productId ? productMap.get(r.productId) : null;
    const display = listProductDisplayFieldsFromMap(productMap, r.productId, {
      productName: r.productName,
      productSku: r.productSku,
    });
    fields.push(display.productName, display.productSku);
    if (product) fields.push(product.name, product.sku);
    const cd = r.customData && typeof r.customData === 'object' ? r.customData : {};
    Object.values(cd).forEach((v) => fields.push(String(v)));
  });
  return fields.some((f) => f && String(f).toLowerCase().includes(kw));
}

function sortPurchaseOrderDocEntries(groups) {
  return Object.entries(groups).sort(([, aItems], [, bItems]) => {
    const ma = flowRecordsEarliestMs(aItems);
    const mb = flowRecordsEarliestMs(bItems);
    if (mb !== ma) return mb - ma;
    const aNum = (aItems[0] && aItems[0].docNumber) || '';
    const bNum = (bItems[0] && bItems[0].docNumber) || '';
    return bNum.localeCompare(aNum);
  });
}

function filterPurchaseOrderDocs(groups, keyword, onlyUnsettled, receivedByOrderLine, productMap) {
  let entries = Object.entries(groups);
  if (onlyUnsettled) {
    entries = entries.filter(([docNumber, items]) =>
      purchaseOrderDocHasUnsettled(docNumber, items, receivedByOrderLine));
  }
  if (keyword) {
    entries = entries.filter(([docNumber, items]) =>
      docMatchesSearch(docNumber, items, keyword, productMap));
  }
  return sortPurchaseOrderDocEntries(Object.fromEntries(entries));
}

function mapLineGroupPreview(docNumber, lineGroupId, items, ctx) {
  const { productMap, receivedByOrderLine, showAmount, dictionaries } = ctx;
  const first = items[0] || {};
  const product = productMap && first.productId ? productMap.get(first.productId) : null;
  const display = listProductDisplayFieldsFromMap(productMap, first.productId, {
    productName: first.productName,
    productSku: first.productSku,
  });
  const ordered = lineGroupTotalQty(items);
  const received = items.reduce(
    (s, i) => s + (receivedByOrderLine[`${docNumber}::${i.id}`] || 0),
    0,
  );
  const progress = inboundProgressMeta(ordered, received);
  const price = Number(first.purchasePrice) || 0;
  const amount = ordered * price;
  const unitName = getProductUnitName(product, dictionaries);

  return {
    lineGroupId,
    ...display,
    quantityText: `${ordered} ${unitName}`,
    qtyText: `${ordered}`,
    unitName,
    priceText: showAmount ? `¥${price.toFixed(2)}` : '',
    amountText: showAmount ? `¥${amount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount),
    showPrice: Boolean(showAmount),
    progressSummaryText: `${received}/${ordered}`,
    ...progress,
  };
}

function mapPurchaseOrderListRow(docNumber, lineGroupId, docItems, lineItems, ctx) {
  const first = docItems[0] || {};
  const line = mapLineGroupPreview(docNumber, lineGroupId, lineItems, ctx);
  const fullyReceived = docFullyReceived(docNumber, docItems, ctx.receivedByOrderLine);
  const sourcePlan = readSourcePlanNumber(docItems);
  const createdAtText = formatPsiDocBusinessDateListZh(docItems);
  const operator = String(first.operator || '').trim();

  return {
    id: `${docNumber}|${lineGroupId}`,
    docNumber,
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    partner: String(first.partner || '').trim() || '—',
    createdAtText,
    showCreatedAt: Boolean(createdAtText && createdAtText !== '—'),
    operator,
    showOperator: Boolean(operator),
    sourcePlan,
    showSourcePlan: Boolean(sourcePlan),
    docFullyReceived: fullyReceived,
    showDocStatusPill: fullyReceived,
    docStatusLabel: fullyReceived ? '已入库完成' : '',
    docStatusPillClass: fullyReceived ? 'st-pill--success' : '',
    ...line,
  };
}

function buildPurchaseOrderListRows(groups, keyword, onlyUnsettled, ctx) {
  const entries = filterPurchaseOrderDocs(
    groups,
    keyword,
    onlyUnsettled,
    ctx.receivedByOrderLine,
    ctx.productMap,
  );
  const rows = [];
  entries.forEach(([docNumber, docItems]) => {
    const lineGroups = groupDocItemsByLineGroup(docItems);
    Object.entries(lineGroups).forEach(([lineGroupId, lineItems]) => {
      rows.push(mapPurchaseOrderListRow(docNumber, lineGroupId, docItems, lineItems, ctx));
    });
  });
  return rows;
}

function mapPurchaseOrderListCard(docNumber, items, ctx) {
  const { receivedByOrderLine, showAmount } = ctx;
  const first = items[0] || {};
  const ordered = docOrderedQty(items);
  const fullyReceived = docFullyReceived(docNumber, items, receivedByOrderLine);
  const totalAmount = lineGroupTotalAmount(items);
  const lineGroups = groupDocItemsByLineGroup(items);
  const lines = Object.entries(lineGroups)
    .map(([lg, grp]) => mapLineGroupPreview(docNumber, lg, grp, ctx));
  const sourcePlan = readSourcePlanNumber(items);
  const createdAtText = formatPsiDocBusinessDateListZh(items);
  const operator = String(first.operator || '').trim();

  return {
    docNumber,
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    partner: String(first.partner || '').trim() || '—',
    createdAtText,
    showCreatedAt: Boolean(createdAtText && createdAtText !== '—'),
    operator,
    showOperator: Boolean(operator),
    sourcePlan,
    showSourcePlan: Boolean(sourcePlan),
    orderedText: `${ordered} PCS`,
    totalAmountText: showAmount ? `¥${totalAmount.toFixed(2)}` : '',
    showDocAmount: Boolean(showAmount && totalAmount > 0),
    fullyReceived,
    showStatusPill: fullyReceived,
    statusLabel: fullyReceived ? '已入库完成' : '',
    statusPillClass: fullyReceived ? 'st-pill--success' : '',
    lines,
    lineCount: lines.length,
  };
}

function buildPurchaseOrderListCards(groups, keyword, onlyUnsettled, ctx) {
  const entries = filterPurchaseOrderDocs(
    groups,
    keyword,
    onlyUnsettled,
    ctx.receivedByOrderLine,
    ctx.productMap,
  );
  return entries.map(([docNumber, docItems]) =>
    mapPurchaseOrderListCard(docNumber, docItems, ctx));
}

function slimPurchaseOrderLinePreview(line) {
  return {
    lineGroupId: line.lineGroupId,
    productName: line.productName,
    productSku: line.productSku,
    showProductSku: line.showProductSku,
    productImageUrl: line.productImageUrl,
    showProductImage: line.showProductImage,
    placeholderIconSrc: line.placeholderIconSrc,
    quantityText: line.quantityText,
    priceText: line.priceText,
    amountText: line.amountText,
    showAmount: line.showAmount,
    showPrice: line.showPrice,
    progressLabel: line.progressLabel,
    progressShortText: line.progressShortText,
    progressOverReceived: line.progressOverReceived,
    progressComplete: line.progressComplete,
    progressOrderedBarPct: line.progressOrderedBarPct,
    progressOverBarPct: line.progressOverBarPct,
    showProgress: line.showProgress,
    receivedText: line.receivedText,
    orderedText: line.orderedText,
  };
}

function slimPurchaseOrderListCard(card) {
  return {
    docNumber: card.docNumber,
    docNumberDisplay: card.docNumberDisplay,
    partner: card.partner,
    createdAtText: card.createdAtText,
    showCreatedAt: card.showCreatedAt,
    operator: card.operator,
    showOperator: card.showOperator,
    sourcePlan: card.sourcePlan,
    showSourcePlan: card.showSourcePlan,
    orderedText: card.orderedText,
    totalAmountText: card.totalAmountText,
    showDocAmount: card.showDocAmount,
    showStatusPill: card.showStatusPill,
    statusLabel: card.statusLabel,
    statusPillClass: card.statusPillClass,
    lineCount: card.lineCount,
    lines: (card.lines || []).map(slimPurchaseOrderLinePreview),
  };
}

function buildDetailLineRows(docNumber, items, ctx) {
  const { productMap, categoryMap, dictionaries, receivedByOrderLine, showAmount } = ctx;
  const lineGroups = groupDocItemsByLineGroup(items);
  const rows = [];

  Object.entries(lineGroups).forEach(([lineGroupId, grp]) => {
    const first = grp[0] || {};
    const product = productMap && first.productId ? productMap.get(first.productId) : null;
    const category = product && categoryMap ? categoryMap.get(product.categoryId) : null;
    const display = listProductDisplayFieldsFromMap(productMap, first.productId, {
      productName: first.productName,
      productSku: first.productSku,
    });
    const ordered = lineGroupTotalQty(grp);
    const received = grp.reduce(
      (s, i) => s + (receivedByOrderLine[`${docNumber}::${i.id}`] || 0),
      0,
    );
    const progress = inboundProgressMeta(ordered, received);
    const price = Number(first.purchasePrice) || 0;
    const amount = ordered * price;
    const unitName = getProductUnitName(product, dictionaries);
    const useMatrix = product && productHasColorSizeMatrix(product, category);
    let matrixLayout = null;
    if (useMatrix) {
      const qtyMap = {};
      grp.forEach((r) => {
        if (r.variantId) qtyMap[r.variantId] = formatPsiQtyDisplay(r.quantity);
      });
      matrixLayout = buildVariantMatrixUiModel(product, dictionaries, qtyMap);
    }

    rows.push({
      lineGroupId,
      ...display,
      quantityText: `${ordered} ${unitName}`,
      priceText: showAmount ? `¥${price.toFixed(2)}` : '',
      amountText: showAmount ? `¥${amount.toFixed(2)}` : '',
      showAmount: Boolean(showAmount),
      showPrice: Boolean(showAmount),
      useMatrix,
      matrixLayout,
      unitName,
      ...progress,
    });
  });

  return rows;
}

function mapPurchaseOrderDetailView(docNumber, items, ctx) {
  const { receivedByOrderLine, showAmount } = ctx;
  const first = items[0] || {};
  const ordered = docOrderedQty(items);
  const received = docReceivedQty(docNumber, items, receivedByOrderLine);
  const progress = inboundProgressMeta(ordered, received);
  const fullyReceived = docFullyReceived(docNumber, items, receivedByOrderLine);
  const totalAmount = lineGroupTotalAmount(items);
  const sourcePlan = readSourcePlanNumber(items);
  const createdAtText = formatPsiDocBusinessDateListZh(items);
  const operator = String(first.operator || '').trim();
  const lineRows = buildDetailLineRows(docNumber, items, ctx);

  const hero = {
    partner: String(first.partner || '').trim() || '—',
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    showStatusPill: fullyReceived,
    statusLabel: fullyReceived ? '已入库完成' : progress.progressLabel,
    statusPillClass: fullyReceived ? 'st-pill--success' : 'st-pill--primary',
    showDispatchPill: true,
  };

  const summaryStats = {
    totalText: `${ordered} PCS`,
    receivedText: `${received} PCS`,
    progressLabel: progress.progressLabel,
    showProgress: progress.showProgress,
  };

  const sections = [
    {
      id: 'basic',
      title: '基础信息',
      kind: 'rows',
      rows: [
        { label: '制单时间', value: createdAtText || '—' },
        { label: '经办人', value: operator || '—' },
        ...(sourcePlan ? [{ label: '来源计划', value: sourcePlan }] : []),
        ...(showAmount ? [{ label: '合计金额', value: `¥${totalAmount.toFixed(2)}` }] : []),
      ],
    },
    {
      id: 'lines',
      title: '明细',
      kind: 'purchase-lines',
      rows: lineRows,
    },
  ];

  return { hero, summaryStats, sections, docNumber };
}

function buildPurchaseOrderFlowRows(records, receivedByOrderLine, productMap) {
  const grouped = groupRecordsByDocNumber(records, 'PURCHASE_ORDER');
  const rows = [];
  Object.entries(grouped).forEach(([docNumber, docItems]) => {
    const lineGroups = groupDocItemsByLineGroup(docItems);
    Object.entries(lineGroups).forEach(([lineGroupId, items]) => {
      rows.push(mapPurchaseOrderFlowRow(docNumber, lineGroupId, items, {
        receivedByOrderLine,
        productMap,
        showAmount: true,
      }));
    });
  });
  return rows.sort((a, b) => {
    if (b.sortKeyMs !== a.sortKeyMs) return b.sortKeyMs - a.sortKeyMs;
    if (a.docNumber !== b.docNumber) return (b.docNumber || '').localeCompare(a.docNumber || '');
    return (a.lineGroupId || '').localeCompare(b.lineGroupId || '');
  });
}

function mapPurchaseOrderFlowRow(docNumber, lineGroupId, items, ctx) {
  const { receivedByOrderLine, productMap, showAmount } = ctx;
  const first = items[0] || {};
  const display = listProductDisplayFieldsFromMap(productMap, first.productId, {
    productName: first.productName,
    productSku: first.productSku,
  });
  const ordered = lineGroupTotalQty(items);
  const amount = lineGroupTotalAmount(items);
  const received = (items || []).reduce(
    (s, i) => s + (receivedByOrderLine[`${docNumber}::${i.id}`] || 0),
    0,
  );
  const progress = inboundProgressMeta(ordered, received);
  const flow = resolvePurchaseOrderLineFlowStatus(docNumber, items, receivedByOrderLine);
  const ms = flowRecordsEarliestMs(items);
  const placedLabel = ms > 0 ? formatLocalDateTimeZh(new Date(ms)) : '—';
  const timeLabel = ms > 0 ? formatReportTime(new Date(ms).toISOString()) : '—';
  const operator = String(first.operator || '').trim();

  return {
    id: `${docNumber}|${lineGroupId}`,
    docNumber,
    lineGroupId,
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    partner: String(first.partner || '').trim() || '—',
    operator,
    operatorLine: operator,
    showOperator: Boolean(operator),
    placedLabel,
    timeLabel,
    sortKeyMs: ms,
    totalQty: ordered,
    receivedQty: received,
    quantityText: `${ordered} PCS`,
    progressShortText: progress.progressShortText,
    showReceivedProgress: received > 0,
    totalAmountText: showAmount ? `¥${amount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount && amount > 0),
    statusKey: flow.statusKey,
    statusLabel: flow.statusLabel,
    statusPillClass: flow.pillClass,
    statusAsideClass: flow.statusKey === 'over_received'
      ? 'po-flow-row__status--over'
      : (flow.statusKey === 'partial' ? 'po-flow-row__status--partial' : ''),
    ...display,
  };
}

function flowRowPlacedYmd(row) {
  const ms = Number(row && row.sortKeyMs) || 0;
  if (ms <= 0) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function filterPurchaseOrderFlowRows(rows, filters) {
  let list = rows || [];
  const dateFrom = filters && filters.dateFrom;
  const dateTo = filters && filters.dateTo;
  if (dateFrom) {
    list = list.filter((row) => {
      const d = flowRowPlacedYmd(row);
      return d && d >= dateFrom;
    });
  }
  if (dateTo) {
    list = list.filter((row) => {
      const d = flowRowPlacedYmd(row);
      return d && d <= dateTo;
    });
  }
  const kw = String((filters && filters.search) || '').trim().toLowerCase();
  if (kw) {
    list = list.filter((row) => {
      const fields = [
        row.docNumber,
        row.docNumberDisplay,
        row.partner,
        row.productName,
        row.productSku,
        row.operator,
      ];
      return fields.some((f) => f && String(f).toLowerCase().includes(kw));
    });
  }
  const status = filters && filters.status;
  if (status && status !== 'all') {
    list = list.filter((row) => row.statusKey === status);
  }
  return list;
}

function computePurchaseOrderFlowStats(rows) {
  const count = (rows || []).length;
  const totalQty = (rows || []).reduce((s, r) => s + (Number(r.totalQty) || 0), 0);
  const totalReceived = (rows || []).reduce((s, r) => s + (Number(r.receivedQty) || 0), 0);
  return { count, totalQty, totalReceived };
}

function buildProductMap(products) {
  const map = new Map();
  (products || []).forEach((p) => {
    if (p && p.id) map.set(p.id, p);
  });
  return map;
}

function buildCategoryMap(categories) {
  const map = new Map();
  (categories || []).forEach((c) => {
    if (c && c.id) map.set(c.id, c);
  });
  return map;
}

module.exports = {
  parsePurchaseOrderSearch,
  formatPsiDocNumForList,
  formatPsiDocBusinessDateListZh,
  inboundProgressMeta,
  resolvePurchaseOrderLineFlowStatus,
  docFullyReceived,
  docMatchesSearch,
  sortPurchaseOrderDocEntries,
  filterPurchaseOrderDocs,
  buildPurchaseOrderListRows,
  buildPurchaseOrderListCards,
  mapPurchaseOrderListRow,
  mapPurchaseOrderListCard,
  slimPurchaseOrderListCard,
  mapPurchaseOrderDetailView,
  buildPurchaseOrderFlowRows,
  mapPurchaseOrderFlowRow,
  filterPurchaseOrderFlowRows,
  computePurchaseOrderFlowStats,
  buildProductMap,
  buildCategoryMap,
  groupDocItemsByLineGroup,
  lineGroupTotalQty,
  lineGroupTotalAmount,
};
