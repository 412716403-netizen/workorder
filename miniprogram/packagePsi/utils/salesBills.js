/**
 * 销售单 view-model（对齐 Web PSIOpsView / PsiDocDetailSummary SALES_BILL）
 */

const { PSI_TYPE } = require('../config/salesBills.js');
const {
  groupRecordsByDocNumber,
  groupDocItemsByLineGroup,
  lineGroupTotalQty,
  formatPsiQtyDisplay,
} = require('../../utils/psiOpsAggregators.js');
const { flowRecordsEarliestMs } = require('../../utils/flowDocSortLite.js');
const { formatReportTime } = require('../../utils/orderReportHistory.js');
const { listProductDisplayFieldsFromMap } = require('../../utils/listProductThumb.js');
const { buildVariantMatrixUiModel } = require('../../utils/variantQtyMatrix.js');
const { productHasColorSizeMatrix } = require('../../utils/productionPlans.js');
const { categoryUsesBatchManagement } = require('../../utils/materialIssueBatch.js');
const { BATCH_NO_UNTAGGED } = require('../../utils/materialStockConfirm.js');
const { getProductUnitName } = require('../../utils/planFormCustomField.js');
const { formatPsiDocNumForList, formatPsiDocBusinessDateListZh } = require('../../utils/purchaseOrders.js');

function lineGroupTotalSalesAmount(items) {
  return (items || []).reduce((s, i) => {
    const qty = formatPsiQtyDisplay(i.quantity);
    return s + qty * (Number(i.salesPrice) || 0);
  }, 0);
}

function parseSalesBillSearch(raw) {
  return { search: String(raw || '').trim() };
}

function docTotalQty(items) {
  return (items || []).reduce((s, i) => s + formatPsiQtyDisplay(i.quantity), 0);
}

function docIsReturn(items) {
  return docTotalQty(items) < 0;
}

function warehouseNameFromMap(warehouseMap, warehouseId) {
  if (!warehouseId) return '—';
  const w = warehouseMap && warehouseMap.get(warehouseId);
  return (w && w.name) || warehouseId;
}

function docMatchesSearch(docNumber, items, keyword, productMap, warehouseMap) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return true;
  const first = items[0] || {};
  const fields = [
    docNumber,
    first.partner,
    first.operator,
    first.note,
    warehouseNameFromMap(warehouseMap, first.warehouseId),
  ];
  (items || []).forEach((r) => {
    const display = listProductDisplayFieldsFromMap(productMap, r.productId, {
      productName: r.productName,
      productSku: r.productSku,
    });
    fields.push(display.productName, display.productSku);
  });
  return fields.some((f) => f && String(f).toLowerCase().includes(kw));
}

function sortSalesBillDocEntries(groups) {
  return Object.entries(groups).sort(([, aItems], [, bItems]) => {
    const ma = flowRecordsEarliestMs(aItems);
    const mb = flowRecordsEarliestMs(bItems);
    if (mb !== ma) return mb - ma;
    const aNum = (aItems[0] && aItems[0].docNumber) || '';
    const bNum = (bItems[0] && bItems[0].docNumber) || '';
    return bNum.localeCompare(aNum);
  });
}

function filterSalesBillDocs(groups, keyword, productMap, warehouseMap) {
  let entries = Object.entries(groups);
  if (keyword) {
    entries = entries.filter(([docNumber, items]) =>
      docMatchesSearch(docNumber, items, keyword, productMap, warehouseMap));
  }
  return sortSalesBillDocEntries(Object.fromEntries(entries));
}

function resolveBatchDisplay(first, ctx) {
  const { productMap, categoryMap } = ctx || {};
  const product = productMap && first.productId ? productMap.get(first.productId) : null;
  const category = product && categoryMap ? categoryMap.get(product.categoryId) : null;
  const useMatrix = Boolean(product && productHasColorSizeMatrix(product, category));
  const needsBatch = Boolean(
    product && categoryUsesBatchManagement(category) && !useMatrix && !first.variantId,
  );
  const raw = String(first.batchNo || first.batch || '').trim();
  if (needsBatch) {
    return raw || BATCH_NO_UNTAGGED;
  }
  return raw;
}

function mapLineGroupPreview(lineGroupId, items, ctx) {
  const { productMap, showAmount, dictionaries } = ctx;
  const first = items[0] || {};
  const product = productMap && first.productId ? productMap.get(first.productId) : null;
  const display = listProductDisplayFieldsFromMap(productMap, first.productId, {
    productName: first.productName,
    productSku: first.productSku,
  });
  const qty = lineGroupTotalQty(items);
  const price = Number(first.salesPrice) || 0;
  const amount = qty * price;
  const unitName = getProductUnitName(product, dictionaries);
  const batch = resolveBatchDisplay(first, ctx);

  return {
    lineGroupId,
    ...display,
    quantityText: `${qty} ${unitName}`,
    priceText: showAmount ? `¥${price.toFixed(2)}` : '',
    amountText: showAmount ? `¥${amount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount),
    showPrice: Boolean(showAmount),
    isReturnLine: qty < 0,
    batch,
    showBatch: Boolean(batch),
  };
}

function mapSalesBillListCard(docNumber, items, ctx) {
  const { showAmount, warehouseMap } = ctx;
  const first = items[0] || {};
  const totalQty = docTotalQty(items);
  const isReturn = totalQty < 0;
  const totalAmount = lineGroupTotalSalesAmount(items);
  const lineGroups = groupDocItemsByLineGroup(items);
  const lines = Object.entries(lineGroups)
    .map(([lg, grp]) => mapLineGroupPreview(lg, grp, ctx));
  const createdAtText = formatPsiDocBusinessDateListZh(items);
  const operator = String(first.operator || '').trim();
  const warehouseName = warehouseNameFromMap(warehouseMap, first.warehouseId);

  return {
    docNumber,
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    partner: String(first.partner || '').trim() || '—',
    warehouseName,
    createdAtText,
    showCreatedAt: Boolean(createdAtText && createdAtText !== '—'),
    operator,
    showOperator: Boolean(operator),
    orderedText: `${totalQty} PCS`,
    totalAmountText: showAmount ? `¥${totalAmount.toFixed(2)}` : '',
    showDocAmount: Boolean(showAmount && totalAmount !== 0),
    isReturn,
    showStatusPill: isReturn,
    statusLabel: isReturn ? '销售退货' : '',
    statusPillClass: isReturn ? 'st-pill--rejected' : '',
    lines,
    lineCount: lines.length,
  };
}

function buildSalesBillListCards(groups, keyword, ctx) {
  const entries = filterSalesBillDocs(
    groups,
    keyword,
    ctx.productMap,
    ctx.warehouseMap,
  );
  return entries.map(([docNumber, docItems]) =>
    mapSalesBillListCard(docNumber, docItems, ctx));
}

function slimSalesBillLinePreview(line) {
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
    isReturnLine: line.isReturnLine,
    batch: line.batch,
    showBatch: line.showBatch,
  };
}

function slimSalesBillListCard(card) {
  return {
    docNumber: card.docNumber,
    docNumberDisplay: card.docNumberDisplay,
    partner: card.partner,
    warehouseName: card.warehouseName,
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
    lines: (card.lines || []).map(slimSalesBillLinePreview),
  };
}

function buildDetailLineRows(items, ctx) {
  const { productMap, categoryMap, dictionaries, showAmount } = ctx;
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
    const qty = lineGroupTotalQty(grp);
    const price = Number(first.salesPrice) || 0;
    const amount = qty * price;
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
    const batch = resolveBatchDisplay(first, ctx);

    rows.push({
      lineGroupId,
      ...display,
      quantityText: `${qty} ${unitName}`,
      priceText: showAmount ? `¥${price.toFixed(2)}` : '',
      amountText: showAmount ? `¥${amount.toFixed(2)}` : '',
      showAmount: Boolean(showAmount),
      showPrice: Boolean(showAmount),
      useMatrix,
      matrixLayout,
      unitName,
      isReturnLine: qty < 0,
      batch,
      showBatch: Boolean(batch),
    });
  });

  return rows;
}

function mapSalesBillDetailView(docNumber, items, ctx) {
  const { showAmount, warehouseMap } = ctx;
  const first = items[0] || {};
  const totalQty = docTotalQty(items);
  const isReturn = totalQty < 0;
  const totalAmount = lineGroupTotalSalesAmount(items);
  const createdAtText = formatPsiDocBusinessDateListZh(items);
  const operator = String(first.operator || '').trim();
  const warehouseName = warehouseNameFromMap(warehouseMap, first.warehouseId);
  const lineRows = buildDetailLineRows(items, ctx);

  const hero = {
    partner: String(first.partner || '').trim() || '—',
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    showStatusPill: isReturn,
    statusLabel: isReturn ? '销售退货' : '销售出库',
    statusPillClass: isReturn ? 'st-pill--rejected' : 'st-pill--success',
    showDispatchPill: true,
  };

  const summaryStats = {
    totalText: `${totalQty} PCS`,
    warehouseText: warehouseName,
    amountText: showAmount ? `¥${totalAmount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount && totalAmount !== 0),
  };

  const sections = [
    {
      id: 'basic',
      title: '基础信息',
      kind: 'rows',
      rows: [
        { label: '制单时间', value: createdAtText || '—' },
        { label: '经办人', value: operator || '—' },
        { label: '出库仓库', value: warehouseName },
        ...(first.note ? [{ label: '备注', value: String(first.note) }] : []),
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

function buildSalesBillFlowRows(records, ctx) {
  const grouped = groupRecordsByDocNumber(records, PSI_TYPE);
  const rows = [];
  Object.entries(grouped).forEach(([docNumber, docItems]) => {
    const lineGroups = groupDocItemsByLineGroup(docItems);
    Object.entries(lineGroups).forEach(([lineGroupId, items]) => {
      rows.push(mapSalesBillFlowRow(docNumber, lineGroupId, items, ctx));
    });
  });
  return rows.sort((a, b) => {
    if (b.sortKeyMs !== a.sortKeyMs) return b.sortKeyMs - a.sortKeyMs;
    if (a.docNumber !== b.docNumber) return (b.docNumber || '').localeCompare(a.docNumber || '');
    return (a.lineGroupId || '').localeCompare(b.lineGroupId || '');
  });
}

function mapSalesBillFlowRow(docNumber, lineGroupId, items, ctx) {
  const { productMap, warehouseMap, showAmount } = ctx;
  const first = items[0] || {};
  const display = listProductDisplayFieldsFromMap(productMap, first.productId, {
    productName: first.productName,
    productSku: first.productSku,
  });
  const qty = lineGroupTotalQty(items);
  const amount = lineGroupTotalSalesAmount(items);
  const ms = flowRecordsEarliestMs(items);
  const timeLabel = ms > 0 ? formatReportTime(new Date(ms).toISOString()) : '—';
  const operator = String(first.operator || '').trim();
  const warehouseName = warehouseNameFromMap(warehouseMap, first.warehouseId);
  const isReturn = qty < 0;

  return {
    id: `${docNumber}|${lineGroupId}`,
    docNumber,
    lineGroupId,
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    partner: String(first.partner || '').trim() || '—',
    warehouseName,
    operator,
    showOperator: Boolean(operator),
    timeLabel,
    sortKeyMs: ms,
    totalQty: qty,
    quantityText: `${qty} PCS`,
    totalAmountText: showAmount ? `¥${amount.toFixed(2)}` : '',
    showAmount: Boolean(showAmount && amount !== 0),
    isReturn,
    statusLabel: isReturn ? '退货' : '',
    showStatusLabel: isReturn,
    statusAsideClass: isReturn ? 'po-flow-row__status--over' : '',
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

function filterSalesBillFlowRows(rows, filters) {
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
        row.warehouseName,
      ];
      return fields.some((f) => f && String(f).toLowerCase().includes(kw));
    });
  }
  return list;
}

function computeSalesBillFlowStats(rows) {
  const count = (rows || []).length;
  const totalQty = (rows || []).reduce((s, r) => s + (Number(r.totalQty) || 0), 0);
  const totalAmount = (rows || []).reduce((s, r) => {
    const text = r.totalAmountText || '';
    const n = parseFloat(String(text).replace(/[¥,]/g, ''));
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  return {
    count,
    totalQty,
    totalAmount,
    totalAmountText: totalAmount !== 0 ? totalAmount.toFixed(2) : '0.00',
  };
}

module.exports = {
  parseSalesBillSearch,
  docTotalQty,
  docIsReturn,
  warehouseNameFromMap,
  buildSalesBillListCards,
  slimSalesBillListCard,
  mapSalesBillDetailView,
  buildSalesBillFlowRows,
  filterSalesBillFlowRows,
  computeSalesBillFlowStats,
};
