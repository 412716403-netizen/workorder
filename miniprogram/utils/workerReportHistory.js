/**
 * 报工 Tab（主包 pages/scan）我的报工列表行映射，避免跨分包 require。
 */

const { localTodayYmd, addDaysYmd } = require('./dateYmd.js');
const {
  DEFAULT_PRODUCT_PLACEHOLDER_ICON,
  listProductNameSkuFromMap,
} = require('./listProductThumb.js');

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

function formatReportTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function productMetaFromMap(productMap, productId, fallbackName, fallbackSku) {
  const nameSku = listProductNameSkuFromMap(productMap, productId, {
    name: fallbackName,
    sku: fallbackSku,
  });
  const product = productMap && productId ? productMap.get(productId) : null;
  return {
    name: nameSku.productName,
    sku: nameSku.productSku,
    showSku: nameSku.showProductSku,
    imageUrl: (product && product.imageUrl) || '',
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
  const orderNumber = r.orderNumber || '';
  const orderHeadline = showOrderNumber
    ? `${orderNumber || '—'} · ${milestoneName}`
    : milestoneName;
  const mainLabel = showOrderNumber ? (orderNumber || '—') : milestoneName;

  return {
    id: r.reportId || r.id || `order-${idx}`,
    orderId: r.orderId || '',
    productId: r.productId || '',
    timeLabel: formatReportTime(r.timestamp),
    timestampMs: new Date(r.timestamp || 0).getTime() || 0,
    orderNumber,
    showOrderNumber,
    orderHeadline,
    mainLabel,
    milestoneName,
    productName: meta.name,
    productSku: meta.sku,
    showProductSku: meta.showSku,
    productImageUrl: meta.imageUrl,
    showProductImage: Boolean(meta.imageUrl),
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
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
  const orderHeadline = milestoneName;

  return {
    id: r.reportId || r.id || `product-${idx}`,
    orderId: r.orderId || '',
    productId: r.productId || '',
    timeLabel: formatReportTime(r.timestamp),
    timestampMs: new Date(r.timestamp || 0).getTime() || 0,
    orderNumber: r.orderNumber || '',
    showOrderNumber: false,
    orderHeadline,
    mainLabel: milestoneName,
    milestoneName,
    productName: meta.name,
    productSku: meta.sku,
    showProductSku: meta.showSku,
    productImageUrl: meta.imageUrl,
    showProductImage: Boolean(meta.imageUrl),
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
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

function reportBatchGroupKey(r) {
  return r.reportBatchId || r.reportId || r.id;
}

function aggregateBatchReports(reports) {
  const first = reports[0];
  const totalGood = reports.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalDefective = reports.reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
  const reportNo = reports.map((r) => r.reportNo).find(Boolean) || '';
  const timestampMs = Math.max(
    ...reports.map((r) => new Date(r.timestamp || 0).getTime() || 0),
  );
  return {
    ...first,
    quantity: totalGood,
    defectiveQuantity: totalDefective,
    reportNo,
    timestampMs,
    _variantCount: reports.length,
  };
}

/**
 * 我的报工列表按 reportBatchId 聚合（多规格一次提交显示一行）
 */
function groupMyReportHistory(hist, productMap, productionLinkMode) {
  const ctx = {
    isGlobalMode: true,
    productionLinkMode: productionLinkMode || 'order',
    productMap,
  };
  const rows = [];

  const orderGroups = new Map();
  (hist.orderReports || []).forEach((r) => {
    const key = reportBatchGroupKey(r);
    if (!orderGroups.has(key)) orderGroups.set(key, []);
    orderGroups.get(key).push(r);
  });
  orderGroups.forEach((reports, key) => {
    const agg = aggregateBatchReports(reports);
    const row = mapOrderReportRow(agg, key, ctx);
    row.id = key;
    row._raw = agg;
    row.goodQtyText = `${agg.quantity} 件`;
    rows.push(row);
  });

  if (productionLinkMode === 'product') {
    const productGroups = new Map();
    (hist.productReports || []).forEach((r) => {
      const key = reportBatchGroupKey(r);
      if (!productGroups.has(key)) productGroups.set(key, []);
      productGroups.get(key).push(r);
    });
    productGroups.forEach((reports, key) => {
      const agg = aggregateBatchReports(reports);
      const row = mapProductReportRow(agg, key, ctx);
      row.id = key;
      row._raw = agg;
      row.goodQtyText = `${agg.quantity} 件`;
      rows.push(row);
    });
  }

  rows.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  return rows;
}

module.exports = {
  defaultDateRange,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
  mapOrderReportRow,
  mapProductReportRow,
  groupMyReportHistory,
};
