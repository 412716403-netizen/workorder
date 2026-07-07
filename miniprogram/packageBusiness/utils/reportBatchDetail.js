/**
 * 报工流水批次分组与详情视图（对齐 Web ReportHistoryModal + ReportBatchDetailModal）
 */
const { formatReportTime, productMetaFromMap } = require('./orderReportHistory.js');
const { productHasColorSizeMatrix, variantLabel, normalizeAppDictionaries } = require('./productionPlans.js');
const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON, listProductNameSkuFields } = require('./listProductThumb.js');

function isOutsourceReceiveReport(r) {
  const customData = r.customData || {};
  const reportNo = r.reportNo || '';
  return customData.source === 'outsourceReceive'
    || r.operator === '外协收回'
    || (typeof reportNo === 'string' && reportNo.startsWith('外协收回·'));
}

function outsourceReceiveDocKey(r) {
  const rn = r.reportNo || '';
  if (rn.startsWith('外协收回·')) return rn.slice('外协收回·'.length).trim() || rn;
  const doc = r.customData && r.customData.docNo;
  if (typeof doc === 'string' && doc.trim()) return doc.trim();
  return rn || r.reportId || '';
}

function orderBatchGroupKey(r) {
  if (isOutsourceReceiveReport(r)) {
    return `wxrecv:${r.orderId}:${r.productId}:${outsourceReceiveDocKey(r)}`;
  }
  return r.reportBatchId || r.reportId;
}

function productBatchGroupKey(r) {
  if (isOutsourceReceiveReport(r)) {
    return `wxrecv:${r.productId}:${outsourceReceiveDocKey(r)}`;
  }
  return r.reportBatchId || r.reportId;
}

function getUnitName(product, dictionaries) {
  const unitId = product && product.unitId;
  if (!unitId) return '件';
  const units = (dictionaries && dictionaries.units) || [];
  const u = units.find((x) => x.id === unitId);
  return (u && u.name) || '件';
}

function resolveLineEconomics(report, ctx) {
  const { product, templateId } = ctx;
  const qty = Number(report.quantity) || 0;
  let rate = Number(report.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    rate = Number(product && product.nodeRates && product.nodeRates[templateId]) || 0;
  }
  const amount = rate > 0 ? rate * qty : 0;
  const weightRaw = report.weight;
  const weight = weightRaw != null && weightRaw !== '' ? Number(weightRaw) : null;
  return {
    rate,
    amount,
    weight: Number.isFinite(weight) ? weight : null,
  };
}

function formatAmount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  return v.toFixed(2);
}

function formatWeightKg(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function timestampToEditParts(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return {
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    };
  }
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

function editPartsToTimestamp(date, time) {
  const t = (time || '00:00').trim();
  const d = new Date(`${date}T${t}:00`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function buildOrderBatches(orderReports) {
  const groups = new Map();
  (orderReports || []).forEach((r) => {
    const key = orderBatchGroupKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ source: 'order', raw: r });
  });
  return Array.from(groups.entries()).map(([key, rows]) => {
    const first = rows[0].raw;
    const totalGood = rows.reduce((s, row) => s + (Number(row.raw.quantity) || 0), 0);
    const totalDefective = rows.reduce((s, row) => s + (Number(row.raw.defectiveQuantity) || 0), 0);
    return {
      key,
      source: 'order',
      rows,
      first,
      totalGood,
      totalDefective,
      reportNo: rows.map((row) => row.raw.reportNo).find(Boolean) || '',
      timestampMs: Math.max(...rows.map((row) => new Date(row.raw.timestamp || 0).getTime() || 0)),
    };
  });
}

function buildProductBatches(productReports) {
  const groups = new Map();
  (productReports || []).forEach((r) => {
    const key = productBatchGroupKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ source: 'product', raw: r });
  });
  return Array.from(groups.entries()).map(([key, rows]) => {
    const first = rows[0].raw;
    const totalGood = rows.reduce((s, row) => s + (Number(row.raw.quantity) || 0), 0);
    const totalDefective = rows.reduce((s, row) => s + (Number(row.raw.defectiveQuantity) || 0), 0);
    return {
      key,
      source: 'product',
      rows,
      first,
      totalGood,
      totalDefective,
      reportNo: rows.map((row) => row.raw.reportNo).find(Boolean) || '',
      timestampMs: Math.max(...rows.map((row) => new Date(row.raw.timestamp || 0).getTime() || 0)),
    };
  });
}

function buildReportBatches(orderReports, productReports, productionLinkMode) {
  const batches = buildOrderBatches(orderReports);
  if (productionLinkMode === 'product') {
    batches.push(...buildProductBatches(productReports));
  }
  batches.sort((a, b) => b.timestampMs - a.timestampMs);
  return batches;
}

function findBatchByKey(batches, batchKey) {
  return (batches || []).find((b) => b.key === batchKey) || null;
}

function mapBatchToListRow(batch, ctx) {
  const {
    isGlobalMode = true,
    productionLinkMode = 'order',
    productMap,
  } = ctx || {};
  const first = batch.first;
  const meta = productMetaFromMap(productMap, first.productId, first.productName, first.sku);
  const milestoneName = first.milestoneName || '工序';
  const showOrderNumber = batch.source === 'order' && isGlobalMode && productionLinkMode !== 'product';
  const mainLabel = showOrderNumber ? (first.orderNumber || '—') : milestoneName;
  const defective = batch.totalDefective;
  const qty = batch.totalGood;

  return {
    id: batch.key,
    batchKey: batch.key,
    source: batch.source,
    orderId: first.orderId || '',
    productId: first.productId || '',
    timeLabel: formatReportTime(first.timestamp),
    timestampMs: batch.timestampMs,
    orderNumber: first.orderNumber || '',
    showOrderNumber,
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
    operatorLine: first.operator ? `操作人：${first.operator}` : '',
    showOperator: Boolean(first.operator),
    reportNo: batch.reportNo || '',
    showReportNo: Boolean(batch.reportNo),
    goodQty: qty,
    defectiveQty: defective,
    isOutsourceReceive: isOutsourceReceiveReport(first),
    _orderNumber: first.orderNumber || '',
    _productName: meta.name || first.productName || '',
    _milestoneName: milestoneName,
    _templateId: first.templateId || first.milestoneTemplateId || '',
    _reportNo: batch.reportNo || first.reportBatchId || batch.key || '',
    _operator: first.operator || '',
  };
}

function buildBatchDetailView(batch, ctx) {
  const {
    products = [],
    categories = [],
    dictionaries = normalizeAppDictionaries(null),
    nodes = [],
    productMap,
    categoryMap,
    showAmount = true,
  } = ctx || {};

  const first = batch.first;
  const isOutsource = isOutsourceReceiveReport(first);
  const product = (productMap && productMap.get(first.productId))
    || products.find((p) => p.id === first.productId);
  const category = product && product.categoryId
    ? ((categoryMap && categoryMap.get(product.categoryId)) || categories.find((c) => c.id === product.categoryId))
    : null;
  const unitName = getUnitName(product, dictionaries);
  const templateId = first.templateId || first.milestoneTemplateId || '';
  const node = nodes.find((n) => n.id === templateId);
  const milestoneName = first.milestoneName || (node && node.name) || '工序';
  const nodeUsesWeight = Boolean(node && node.enableWeightOnReport);
  const nameSku = listProductNameSkuFields(product, {
    name: first.productName,
    sku: first.sku,
  });

  const qtyMap = {};
  batch.rows.forEach((row) => {
    const r = row.raw;
    if (r.variantId != null) {
      qtyMap[r.variantId] = String(Number(r.quantity) || 0);
    }
  });

  let matrixLayout = null;
  if (product && productHasColorSizeMatrix(product, category)) {
    matrixLayout = buildVariantMatrixUiModel(product, dictionaries, qtyMap);
  }

  let totalAmount = 0;
  let totalWeight = 0;
  const lineItems = batch.rows.map((row) => {
    const r = row.raw;
    const variant = product && product.variants
      ? product.variants.find((v) => v.id === r.variantId)
      : null;
    const vLabel = variantLabel(variant, dictionaries) || (variant && variant.skuSuffix) || '';
    const eco = resolveLineEconomics(r, { product, templateId });
    totalAmount += eco.amount;
    if (eco.weight) totalWeight += eco.weight;
    const goodQty = Number(r.quantity) || 0;
    const defQty = Number(r.defectiveQuantity) || 0;
    return {
      reportId: r.reportId,
      variantId: r.variantId || '',
      orderId: r.orderId || '',
      milestoneId: r.milestoneId || '',
      progressId: r.progressId || '',
      source: row.source,
      productName: nameSku.productName,
      productSku: nameSku.productSku,
      showProductSku: nameSku.showProductSku,
      orderNumber: r.orderNumber || '',
      showOrderNumber: batch.source === 'order',
      variantLabel: vLabel,
      showVariantLabel: Boolean(vLabel),
      goodQty,
      defectiveQty: defQty,
      showDefective: defQty > 0,
      goodQtyText: `${goodQty} ${unitName}`,
      defectiveText: defQty > 0 ? `不良 ${defQty} ${unitName}` : '',
      rateText: eco.rate > 0 ? `${eco.rate.toFixed(2)} 元/${unitName}` : '—',
      amountText: eco.amount > 0 ? formatAmount(eco.amount) : '—',
      weightText: eco.weight ? formatWeightKg(eco.weight) : '—',
      showWeight: Boolean(eco.weight),
      editGoodQty: String(goodQty),
      editDefectiveQty: String(defQty),
    };
  });

  const tsParts = timestampToEditParts(first.timestamp);
  const customData = first.customData || {};
  const customEntries = Object.keys(customData)
    .filter((k) => k !== 'source' && k !== 'docNo' && customData[k] != null && customData[k] !== '')
    .map((k) => ({ label: k, display: String(customData[k]) }));

  let batchUnitRate = 0;
  if (isOutsource && batch.totalGood > 0 && totalAmount > 0) {
    batchUnitRate = totalAmount / batch.totalGood;
  } else {
    const firstEco = resolveLineEconomics(first, { product, templateId });
    batchUnitRate = firstEco.rate;
  }

  return {
    batchKey: batch.key,
    source: batch.source,
    isOutsourceReceive: isOutsource,
    orderNumber: batch.source === 'order' ? (first.orderNumber || '') : '',
    showOrderNumber: batch.source === 'order',
    productName: nameSku.productName,
    productSku: nameSku.productSku,
    showProductSku: nameSku.showProductSku,
    reportNo: batch.reportNo || '',
    showReportNo: Boolean(batch.reportNo),
    milestoneName,
    timeLabel: formatReportTime(first.timestamp),
    operator: first.operator || '—',
    unitName,
    totalGoodText: `${batch.totalGood} ${unitName}`,
    totalDefectiveText: batch.totalDefective > 0 ? `${batch.totalDefective} ${unitName}` : '',
    showDefectiveTotal: batch.totalDefective > 0,
    totalAmountText: totalAmount > 0 ? `¥${formatAmount(totalAmount)}` : '',
    showAmount: showAmount && totalAmount > 0,
    unitPriceText: batchUnitRate > 0 ? `${batchUnitRate.toFixed(2)} 元/${unitName}` : '—',
    showUnitPrice: !isOutsource,
    batchUnitRate,
    editRate: batchUnitRate > 0 ? String(batchUnitRate) : '',
    templateId,
    productId: first.productId || '',
    reportBatchId: first.reportBatchId || batch.key,
    totalWeightText: totalWeight > 0 ? `${formatWeightKg(totalWeight)} kg` : '',
    showWeight: nodeUsesWeight && totalWeight > 0,
    customEntries,
    showCustomEntries: customEntries.length > 0,
    lineItems,
    matrixLayout,
    showMatrix: Boolean(matrixLayout),
    editDate: tsParts.date,
    editTime: tsParts.time,
    editOperator: first.operator || '',
    productImageUrl: (product && product.imageUrl) || '',
    showProductImage: Boolean(product && product.imageUrl),
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
  };
}

function computeReportHistoryStatsFromBatches(batches) {
  return (batches || []).reduce(
    (acc, batch) => ({
      batchCount: acc.batchCount + 1,
      goodTotal: acc.goodTotal + (batch.totalGood || 0),
      defectiveTotal: acc.defectiveTotal + (batch.totalDefective || 0),
    }),
    { batchCount: 0, goodTotal: 0, defectiveTotal: 0 },
  );
}

module.exports = {
  isOutsourceReceiveReport,
  buildReportBatches,
  findBatchByKey,
  mapBatchToListRow,
  buildBatchDetailView,
  computeReportHistoryStatsFromBatches,
  timestampToEditParts,
  editPartsToTimestamp,
  getUnitName,
};
