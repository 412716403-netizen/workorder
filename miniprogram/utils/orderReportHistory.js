const { localTodayYmd, addDaysYmd } = require('./dateYmd.js');
const { productNameSkuParts } = require('./productionPlans.js');

function defaultDateRange() {
  const end = localTodayYmd();
  const start = addDaysYmd(end, -29);
  return { start, end };
}

/** 对齐 Web dateInputToIsoStart：本地零点 */
function dateInputToIsoStart(value) {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** 对齐 Web dateInputToIsoEndExclusive：次日零点（半开区间右端） */
function dateInputToIsoEndExclusive(value) {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function reportTimestampToYmd(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatReportTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function productMetaFromMap(productMap, productId, fallbackName, fallbackSku) {
  const product = productMap && productId ? productMap.get(productId) : null;
  if (!product) {
    return {
      name: fallbackName || '',
      sku: fallbackSku || '',
      showSku: Boolean(fallbackSku),
      imageUrl: '',
    };
  }
  const display = productNameSkuParts(product);
  return {
    name: display.name || fallbackName || '',
    sku: display.sku || fallbackSku || '',
    showSku: display.showSku,
    imageUrl: product.imageUrl || '',
  };
}

function mapOrderReportRow(r, idx, ctx) {
  const {
    isGlobalMode = true,
    productionLinkMode = 'order',
    productMap,
  } = ctx || {};
  const qty = Number(r.quantity) || 0;
  const defective = Number(r.defectiveQuantity) || 0;
  const milestoneName = r.milestoneName || r.nodeName || '工序';
  const meta = productMetaFromMap(productMap, r.productId, r.productName, r.sku);
  const showOrderNumber = isGlobalMode && productionLinkMode !== 'product';
  const mainLabel = showOrderNumber ? (r.orderNumber || '—') : milestoneName;

  return {
    id: r.reportId || r.id || `order-${idx}`,
    orderId: r.orderId || '',
    productId: r.productId || '',
    timeLabel: formatReportTime(r.timestamp),
    timestampMs: new Date(r.timestamp || 0).getTime() || 0,
    orderNumber: r.orderNumber || '',
    showOrderNumber,
    mainLabel,
    milestoneName,
    productName: meta.name,
    productSku: meta.sku,
    showProductSku: meta.showSku,
    productImageUrl: meta.imageUrl,
    showProductImage: Boolean(meta.imageUrl),
    placeholderIconSrc: '/assets/icons/clipboard-list.png',
    goodQtyText: `${qty} 件`,
    showDefective: defective > 0,
    defectiveText: defective > 0 ? `不良 ${defective}` : '',
    operatorLine: r.operator ? `操作人：${r.operator}` : '',
    showOperator: Boolean(r.operator),
    reportNo: r.reportNo || '',
    showReportNo: Boolean(r.reportNo),
    goodQty: qty,
    defectiveQty: defective,
    _orderNumber: r.orderNumber || '',
    _productName: meta.name || r.productName || '',
    _milestoneName: milestoneName,
  };
}

function mapProductReportRow(r, idx, ctx) {
  const { productMap } = ctx || {};
  const qty = Number(r.quantity) || 0;
  const defective = Number(r.defectiveQuantity) || 0;
  const milestoneName = r.milestoneName || r.nodeName || '工序';
  const meta = productMetaFromMap(productMap, r.productId, r.productName, r.sku);

  return {
    id: r.reportId || r.id || `product-${idx}`,
    orderId: r.orderId || '',
    productId: r.productId || '',
    timeLabel: formatReportTime(r.timestamp),
    timestampMs: new Date(r.timestamp || 0).getTime() || 0,
    orderNumber: r.orderNumber || '',
    showOrderNumber: false,
    mainLabel: milestoneName,
    milestoneName,
    productName: meta.name,
    productSku: meta.sku,
    showProductSku: meta.showSku,
    productImageUrl: meta.imageUrl,
    showProductImage: Boolean(meta.imageUrl),
    placeholderIconSrc: '/assets/icons/clipboard-list.png',
    goodQtyText: `${qty} 件`,
    showDefective: defective > 0,
    defectiveText: defective > 0 ? `不良 ${defective}` : '',
    operatorLine: r.operator ? `操作人：${r.operator}` : '',
    showOperator: Boolean(r.operator),
    reportNo: r.reportNo || '',
    showReportNo: Boolean(r.reportNo),
    goodQty: qty,
    defectiveQty: defective,
    _orderNumber: r.orderNumber || '',
    _productName: meta.name || r.productName || '',
    _milestoneName: milestoneName,
  };
}

function filterReportHistoryRows(rows, searchKeyword) {
  const kw = (searchKeyword || '').trim().toLowerCase();
  if (!kw) return rows || [];
  return (rows || []).filter((row) =>
    (row._orderNumber || '').toLowerCase().includes(kw)
    || (row._productName || '').toLowerCase().includes(kw)
    || (row._milestoneName || '').toLowerCase().includes(kw),
  );
}

function computeReportHistoryStats(rows) {
  return (rows || []).reduce(
    (acc, row) => ({
      batchCount: acc.batchCount + 1,
      goodTotal: acc.goodTotal + (row.goodQty || 0),
      defectiveTotal: acc.defectiveTotal + (row.defectiveQty || 0),
    }),
    { batchCount: 0, goodTotal: 0, defectiveTotal: 0 },
  );
}

/** 根据工单内报工记录推算筛选日期（无记录时回退近 30 天） */
function buildReportHistoryDateRangeForOrder(order) {
  const end = localTodayYmd();
  const ymds = [];
  (order.milestones || []).forEach((m) => {
    (m.reports || []).forEach((r) => {
      const ymd = reportTimestampToYmd(r.timestamp);
      if (ymd) ymds.push(ymd);
    });
  });
  if (ymds.length) {
    ymds.sort();
    return { start: ymds[0], end: ymds[ymds.length - 1] };
  }
  return defaultDateRange();
}

module.exports = {
  localTodayYmd,
  defaultDateRange,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
  reportTimestampToYmd,
  formatReportTime,
  mapOrderReportRow,
  mapProductReportRow,
  filterReportHistoryRows,
  computeReportHistoryStats,
  buildReportHistoryDateRangeForOrder,
};
