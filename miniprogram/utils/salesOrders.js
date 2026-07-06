/**
 * 销售订单 view-model（对齐 Web PSIOpsView / PsiDocDetailSummary）
 */

const { SALES_ORDER_FLOW_STATUS_PILL } = require('../config/salesOrders.js');
const {
  groupRecordsByDocNumber,
  groupDocItemsByLineGroup,
  lineGroupTotalQty,
  formatPsiQtyDisplay,
} = require('./psiOpsAggregators.js');
const { effectiveAllocatedQuantity, linePendingShipQty } = require('./psiAllocationDisplay.js');
const { flowRecordsEarliestMs, formatLocalDateTimeZh } = require('./flowDocSortLite.js');
const { formatReportTime } = require('./orderReportHistory.js');
const { listProductDisplayFieldsFromMap } = require('./listProductThumb.js');
const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
const { productHasColorSizeMatrix } = require('./productionPlans.js');
const { getProductUnitName } = require('./planFormCustomField.js');

function lineGroupTotalSalesAmount(items) {
  return (items || []).reduce((s, i) => {
    const qty = formatPsiQtyDisplay(i.quantity);
    return s + qty * (Number(i.salesPrice) || 0);
  }, 0);
}

function salesOrderDocHasNotFullyShippedLine(docItems) {
  const groups = groupDocItemsByLineGroup(docItems || []);
  return Object.values(groups).some((grp) => {
    const orderQty = lineGroupTotalQty(grp);
    const shippedQty = grp.reduce((s, i) => s + formatPsiQtyDisplay(i.shippedQuantity), 0);
    return shippedQty < orderQty;
  });
}

function salesOrderDocFullyShipped(docItems) {
  if (!docItems || !docItems.length) return false;
  return !salesOrderDocHasNotFullyShippedLine(docItems);
}

function lineGroupShippedQty(items) {
  return (items || []).reduce((s, i) => s + formatPsiQtyDisplay(i.shippedQuantity), 0);
}

function lineGroupAllocatedQty(items) {
  return (items || []).reduce(
    (s, i) => s + effectiveAllocatedQuantity(i.allocatedQuantity, i.shippedQuantity),
    0,
  );
}

function shipmentProgressMeta(ordered, shipped, allocatedEff) {
  if (ordered <= 0) {
    return {
      progressLabel: '',
      progressShortText: '0/0',
      progressComplete: false,
      progressOverAllocated: false,
      progressShippedBarPct: 0,
      progressAllocBarPct: 0,
      progressOverBarPct: 0,
      showProgress: false,
      shippedText: '0',
      orderedText: '0',
      allocatedText: '0',
    };
  }
  const alloc = Math.min(allocatedEff, ordered);
  const ship = Math.min(shipped, ordered);
  const allocPending = Math.max(0, alloc - ship);
  const progressOverAllocated = allocatedEff > ordered;
  const progressComplete = shipped >= ordered && !progressOverAllocated;

  let progressLabel;
  if (progressOverAllocated) progressLabel = '超配';
  else if (progressComplete) progressLabel = '已发齐';
  else if (ship > 0) progressLabel = `${Math.round((ship / ordered) * 100)}%`;
  else if (allocPending > 0) progressLabel = '有待发';
  else if (allocatedEff > 0) progressLabel = '已配货';
  else progressLabel = '未配货';

  let progressShippedBarPct = 0;
  let progressAllocBarPct = 0;
  let progressOverBarPct = 0;
  if (progressOverAllocated && allocatedEff > 0) {
    progressShippedBarPct = Math.round((Math.min(shipped, ordered) / allocatedEff) * 100);
    progressAllocBarPct = Math.round((Math.max(0, alloc - ship) / allocatedEff) * 100);
    progressOverBarPct = 100 - progressShippedBarPct - progressAllocBarPct;
  } else {
    progressShippedBarPct = Math.round((ship / ordered) * 100);
    progressAllocBarPct = Math.round((allocPending / ordered) * 100);
  }

  return {
    progressLabel,
    progressShortText: `${shipped}/${ordered}`,
    progressComplete,
    progressOverAllocated,
    progressShippedBarPct,
    progressAllocBarPct,
    progressOverBarPct,
    showProgress: true,
    shippedText: String(shipped),
    orderedText: String(ordered),
    allocatedText: String(allocatedEff),
  };
}

function resolveSalesOrderLineFlowStatus(items) {
  const orderQty = lineGroupTotalQty(items);
  const allocatedQty = (items || []).reduce((s, i) => s + formatPsiQtyDisplay(i.allocatedQuantity), 0);
  const shippedQty = lineGroupShippedQty(items);
  const allocPendingQty = Math.max(0, allocatedQty - shippedQty);

  if (orderQty > 0 && allocatedQty > orderQty) {
    return { statusKey: 'over_allocated', statusLabel: '超配', pillClass: SALES_ORDER_FLOW_STATUS_PILL.over_allocated };
  }
  if (orderQty > 0 && shippedQty >= orderQty) {
    return { statusKey: 'fully_shipped', statusLabel: '已发齐', pillClass: SALES_ORDER_FLOW_STATUS_PILL.fully_shipped };
  }
  if (allocPendingQty > 0) {
    return { statusKey: 'pending_ship', statusLabel: '有待发', pillClass: SALES_ORDER_FLOW_STATUS_PILL.pending_ship };
  }
  if (allocatedQty > 0) {
    return { statusKey: 'allocated', statusLabel: '已配货', pillClass: SALES_ORDER_FLOW_STATUS_PILL.allocated };
  }
  return { statusKey: 'unallocated', statusLabel: '未配货', pillClass: SALES_ORDER_FLOW_STATUS_PILL.unallocated };
}

function parseSalesOrderSearch(raw) {
  return { search: String(raw || '').trim() };
}

function formatPsiDocNumForList(docNumber) {
  const s = String(docNumber || '').trim();
  return s || '—';
}

function formatPsiDocBusinessDateListZh(docLines) {
  const ms = flowRecordsEarliestMs(docLines);
  if (ms <= 0) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function docMatchesSearch(docNumber, items, keyword, productMap) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return true;
  const first = items[0] || {};
  const fields = [docNumber, first.partner, first.operator, first.note];
  (items || []).forEach((r) => {
    const product = productMap && r.productId ? productMap.get(r.productId) : null;
    const display = listProductDisplayFieldsFromMap(productMap, r.productId, {
      productName: r.productName,
      productSku: r.productSku,
    });
    fields.push(display.productName, display.productSku);
    if (product) fields.push(product.name, product.sku);
  });
  return fields.some((f) => f && String(f).toLowerCase().includes(kw));
}

function sortSalesOrderDocEntries(groups) {
  return Object.entries(groups).sort(([, aItems], [, bItems]) => {
    const ma = flowRecordsEarliestMs(aItems);
    const mb = flowRecordsEarliestMs(bItems);
    if (mb !== ma) return mb - ma;
    return ((bItems[0] && bItems[0].docNumber) || '').localeCompare((aItems[0] && aItems[0].docNumber) || '');
  });
}

function filterSalesOrderDocs(groups, keyword, onlyNotFullyShipped, productMap) {
  let entries = Object.entries(groups);
  if (onlyNotFullyShipped) {
    entries = entries.filter(([, items]) => salesOrderDocHasNotFullyShippedLine(items));
  }
  if (keyword) {
    entries = entries.filter(([docNumber, items]) =>
      docMatchesSearch(docNumber, items, keyword, productMap));
  }
  return sortSalesOrderDocEntries(Object.fromEntries(entries));
}

function mapLineGroupPreview(docNumber, lineGroupId, items, ctx) {
  const { productMap, dictionaries, showAmount, canAllocate } = ctx;
  const first = items[0] || {};
  const product = productMap && first.productId ? productMap.get(first.productId) : null;
  const display = listProductDisplayFieldsFromMap(productMap, first.productId, {
    productName: first.productName,
    productSku: first.productSku,
  });
  const ordered = lineGroupTotalQty(items);
  const shipped = lineGroupShippedQty(items);
  const allocatedEff = lineGroupAllocatedQty(items);
  const allocatedQty = (items || []).reduce((s, i) => s + formatPsiQtyDisplay(i.allocatedQuantity), 0);
  const allocPendingQty = Math.max(0, allocatedQty - shipped);
  const progress = shipmentProgressMeta(ordered, shipped, allocatedEff);
  const price = Number(first.salesPrice) || 0;
  const amount = ordered * price;
  const unitName = getProductUnitName(product, dictionaries);

  return {
    lineGroupId,
    ...display,
    quantityText: `${ordered} ${unitName}`,
    priceText: showAmount ? `¥${price.toFixed(2)}` : '',
    amountText: showAmount ? `¥${amount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount),
    showPrice: Boolean(showAmount),
    progressSummaryText: `${shipped}/${ordered}`,
    showAllocateBtn: Boolean(canAllocate),
    allocProgressText: ordered > 0
      ? `已发 ${shipped} / 待发 ${allocPendingQty}${allocatedQty > ordered ? '（超配）' : ''}${shipped >= ordered && ordered > 0 ? ' · 已发齐' : ''}`
      : '',
    showAllocProgress: ordered > 0,
    ...progress,
  };
}

function mapSalesOrderListCard(docNumber, items, ctx) {
  const { showAmount } = ctx;
  const first = items[0] || {};
  const ordered = lineGroupTotalQty(items);
  const fullyShipped = salesOrderDocFullyShipped(items);
  const totalAmount = lineGroupTotalSalesAmount(items);
  const lineGroups = groupDocItemsByLineGroup(items);
  const lines = Object.entries(lineGroups).map(([lg, grp]) =>
    mapLineGroupPreview(docNumber, lg, grp, ctx));
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
    orderedText: `${ordered} PCS`,
    totalAmountText: showAmount ? `¥${totalAmount.toFixed(2)}` : '',
    showDocAmount: Boolean(showAmount && totalAmount > 0),
    fullyShipped,
    showStatusPill: fullyShipped,
    statusLabel: fullyShipped ? '已完成' : '',
    statusPillClass: fullyShipped ? 'st-pill--success' : '',
    lines,
    lineCount: lines.length,
  };
}

function buildSalesOrderListCards(groups, keyword, onlyNotFullyShipped, ctx) {
  const entries = filterSalesOrderDocs(groups, keyword, onlyNotFullyShipped, ctx.productMap);
  return entries.map(([docNumber, docItems]) =>
    mapSalesOrderListCard(docNumber, docItems, ctx));
}

function slimSalesOrderLinePreview(line) {
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
    progressOverAllocated: line.progressOverAllocated,
    progressComplete: line.progressComplete,
    progressShippedBarPct: line.progressShippedBarPct,
    progressAllocBarPct: line.progressAllocBarPct,
    progressOverBarPct: line.progressOverBarPct,
    showProgress: line.showProgress,
    shippedText: line.shippedText,
    orderedText: line.orderedText,
    showAllocateBtn: line.showAllocateBtn,
    allocProgressText: line.allocProgressText,
    showAllocProgress: line.showAllocProgress,
  };
}

function slimSalesOrderListCard(card) {
  return {
    docNumber: card.docNumber,
    docNumberDisplay: card.docNumberDisplay,
    partner: card.partner,
    createdAtText: card.createdAtText,
    showCreatedAt: card.showCreatedAt,
    operator: card.operator,
    showOperator: card.showOperator,
    orderedText: card.orderedText,
    totalAmountText: card.totalAmountText,
    showDocAmount: card.showDocAmount,
    showStatusPill: card.showStatusPill,
    statusLabel: card.statusLabel,
    statusPillClass: card.statusPillClass,
    lineCount: card.lineCount,
    lines: (card.lines || []).map(slimSalesOrderLinePreview),
  };
}

function buildDetailLineRows(docNumber, items, ctx) {
  const { productMap, categoryMap, dictionaries, showAmount, canAllocate } = ctx;
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
    const shipped = lineGroupShippedQty(grp);
    const allocatedEff = lineGroupAllocatedQty(grp);
    const progress = shipmentProgressMeta(ordered, shipped, allocatedEff);
    const price = Number(first.salesPrice) || 0;
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
    const flow = resolveSalesOrderLineFlowStatus(grp);
    const canAllocateLine = Boolean(canAllocate && flow.statusKey !== 'fully_shipped');

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
      statusLabel: flow.statusLabel,
      statusPillClass: flow.pillClass,
      showAllocateBtn: canAllocateLine,
      ...progress,
    });
  });

  return rows;
}

function mapSalesOrderDetailView(docNumber, items, ctx) {
  const { showAmount } = ctx;
  const first = items[0] || {};
  const ordered = lineGroupTotalQty(items);
  const shipped = lineGroupShippedQty(items);
  const allocatedEff = lineGroupAllocatedQty(items);
  const progress = shipmentProgressMeta(ordered, shipped, allocatedEff);
  const fullyShipped = salesOrderDocFullyShipped(items);
  const totalAmount = lineGroupTotalSalesAmount(items);
  const createdAtText = formatPsiDocBusinessDateListZh(items);
  const operator = String(first.operator || '').trim();
  const lineRows = buildDetailLineRows(docNumber, items, ctx);

  const hero = {
    partner: String(first.partner || '').trim() || '—',
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    showStatusPill: fullyShipped || progress.progressLabel,
    statusLabel: fullyShipped ? '已完成' : progress.progressLabel,
    statusPillClass: fullyShipped ? 'st-pill--success' : 'st-pill--primary',
    showDispatchPill: true,
  };

  const summaryStats = {
    totalText: `${ordered} PCS`,
    shippedText: `${shipped} PCS`,
    allocatedText: `${allocatedEff} PCS`,
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
        ...(showAmount ? [{ label: '合计金额', value: `¥${totalAmount.toFixed(2)}` }] : []),
      ],
    },
    {
      id: 'lines',
      title: '明细',
      kind: 'sales-lines',
      rows: lineRows,
    },
  ];

  return { hero, summaryStats, sections, docNumber };
}

function buildSalesOrderFlowRows(records, productMap) {
  const grouped = groupRecordsByDocNumber(records, 'SALES_ORDER');
  const rows = [];
  Object.entries(grouped).forEach(([docNumber, docItems]) => {
    const lineGroups = groupDocItemsByLineGroup(docItems);
    Object.entries(lineGroups).forEach(([lineGroupId, items]) => {
      rows.push(mapSalesOrderFlowRow(docNumber, lineGroupId, items, { productMap, showAmount: true }));
    });
  });
  return rows.sort((a, b) => {
    if (b.sortKeyMs !== a.sortKeyMs) return b.sortKeyMs - a.sortKeyMs;
    if (a.docNumber !== b.docNumber) return (b.docNumber || '').localeCompare(a.docNumber || '');
    return (a.lineGroupId || '').localeCompare(b.lineGroupId || '');
  });
}

function mapSalesOrderFlowRow(docNumber, lineGroupId, items, ctx) {
  const { productMap, showAmount } = ctx;
  const first = items[0] || {};
  const display = listProductDisplayFieldsFromMap(productMap, first.productId, {
    productName: first.productName,
    productSku: first.productSku,
  });
  const ordered = lineGroupTotalQty(items);
  const amount = lineGroupTotalSalesAmount(items);
  const shipped = lineGroupShippedQty(items);
  const allocatedEff = lineGroupAllocatedQty(items);
  const progress = shipmentProgressMeta(ordered, shipped, allocatedEff);
  const flow = resolveSalesOrderLineFlowStatus(items);
  const ms = flowRecordsEarliestMs(items);
  const timeLabel = ms > 0 ? formatReportTime(new Date(ms).toISOString()) : '—';
  const operator = String(first.operator || '').trim();

  return {
    id: `${docNumber}|${lineGroupId}`,
    docNumber,
    lineGroupId,
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    partner: String(first.partner || '').trim() || '—',
    operator,
    showOperator: Boolean(operator),
    timeLabel,
    sortKeyMs: ms,
    totalQty: ordered,
    shippedQty: shipped,
    quantityText: `${ordered} PCS`,
    progressShortText: progress.progressShortText,
    showShippedProgress: shipped > 0 || allocatedEff > 0,
    totalAmountText: showAmount ? `¥${amount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount && amount > 0),
    statusKey: flow.statusKey,
    statusLabel: flow.statusLabel,
    statusPillClass: flow.pillClass,
    statusAsideClass: flow.statusKey === 'over_allocated'
      ? 'so-flow-row__status--over'
      : (flow.statusKey === 'pending_ship' ? 'so-flow-row__status--partial' : ''),
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

function filterSalesOrderFlowRows(rows, filters) {
  let list = rows || [];
  const { dateFrom, dateTo, search, status } = filters || {};
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
  const kw = String(search || '').trim().toLowerCase();
  if (kw) {
    list = list.filter((row) => {
      const fields = [
        row.docNumber, row.docNumberDisplay, row.partner,
        row.productName, row.productSku, row.operator,
      ];
      return fields.some((f) => f && String(f).toLowerCase().includes(kw));
    });
  }
  if (status && status !== 'all') {
    if (status === 'allocated') {
      list = list.filter((row) => row.statusKey === 'allocated' || row.statusKey === 'pending_ship');
    } else {
      list = list.filter((row) => row.statusKey === status);
    }
  }
  return list;
}

function computeSalesOrderFlowStats(rows) {
  const count = (rows || []).length;
  const totalQty = (rows || []).reduce((s, r) => s + (Number(r.totalQty) || 0), 0);
  const totalShipped = (rows || []).reduce((s, r) => s + (Number(r.shippedQty) || 0), 0);
  return { count, totalQty, totalShipped };
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

function buildWarehouseMap(warehouses) {
  const map = new Map();
  (warehouses || []).forEach((w) => {
    if (w && w.id) map.set(w.id, w);
  });
  return map;
}

function buildPendingShipmentGroups(records, productMap, warehouseMap) {
  const list = (records || []).filter((r) => r.type === 'SALES_ORDER' && linePendingShipQty(r) > 0);
  const groups = {};
  list.forEach((r) => {
    const gid = r.lineGroupId || r.id;
    const key = `${r.docNumber}::${gid}`;
    if (!groups[key]) {
      groups[key] = { docNumber: r.docNumber, productId: r.productId, records: [] };
    }
    groups[key].records.push(r);
  });
  return Object.entries(groups).map(([groupKey, g]) => {
    const product = productMap && g.productId ? productMap.get(g.productId) : null;
    const first = g.records[0] || {};
    const whId = first.allocationWarehouseId || first.warehouseId || '';
    const warehouse = warehouseMap && whId ? warehouseMap.get(whId) : null;
    const totalQuantity = g.records.reduce((s, r) => s + linePendingShipQty(r), 0);
    const display = listProductDisplayFieldsFromMap(productMap, g.productId, {
      productName: first.productName,
      productSku: first.productSku,
    });
    return {
      groupKey,
      docNumber: g.docNumber,
      lineGroupId: first.lineGroupId || first.id,
      productId: g.productId,
      ...display,
      partner: first.partner || '—',
      warehouseId: whId,
      warehouseName: (warehouse && warehouse.name) || whId || '—',
      totalQuantity,
      recordIds: g.records.map((r) => r.id),
      records: g.records,
    };
  }).sort((a, b) => (b.docNumber || '').localeCompare(a.docNumber || ''));
}

module.exports = {
  lineGroupTotalSalesAmount,
  salesOrderDocHasNotFullyShippedLine,
  salesOrderDocFullyShipped,
  shipmentProgressMeta,
  resolveSalesOrderLineFlowStatus,
  parseSalesOrderSearch,
  formatPsiDocNumForList,
  formatPsiDocBusinessDateListZh,
  buildSalesOrderListCards,
  slimSalesOrderListCard,
  mapSalesOrderDetailView,
  buildSalesOrderFlowRows,
  filterSalesOrderFlowRows,
  computeSalesOrderFlowStats,
  buildProductMap,
  buildCategoryMap,
  buildWarehouseMap,
  buildPendingShipmentGroups,
  groupDocItemsByLineGroup,
  lineGroupTotalQty,
};
