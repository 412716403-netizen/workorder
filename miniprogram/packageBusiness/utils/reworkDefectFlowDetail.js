/**
 * 处理不良流水详情视图
 */

const { formatReportTime } = require('./orderReportHistory.js');
const { flowRecordsEarliestMs } = require('./flowDocSortLite.js');
const { listProductThumbFromProduct, listProductNameSkuFields } = require('./listProductThumb.js');
const { productHasColorSizeMatrix, variantLabel } = require('./productionPlans.js');
const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
const { getProductUnitName } = require('./planFormCustomField.js');
const { timestampToEditParts } = require('./reportBatchDetail.js');
const {
  isOutsourceReworkRecord,
  reworkTypeLabel,
  collectOutsourcePartners,
} = require('./reworkDefectFlow.js');

function typeLabelFromRecords(recs) {
  const labels = new Set();
  (recs || []).forEach((r) => {
    const label = reworkTypeLabel(r);
    if (label !== '—') labels.add(label);
  });
  if (!labels.size) return '—';
  return [...labels].join('、');
}

function buildDefectFlowDetailView(records, ctx) {
  const {
    ordersById = new Map(),
    productsById = new Map(),
    nodesById = new Map(),
    categoriesById = new Map(),
    dictionaries = {},
  } = ctx || {};

  const sorted = [...(records || [])].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  if (!sorted.length) return null;
  const first = sorted[0];
  const order = first.orderId ? ordersById.get(first.orderId) : null;
  const product = productsById.get(first.productId || (order && order.productId));
  const category = product ? categoriesById.get(product.categoryId) : null;
  const unitName = getProductUnitName(product, dictionaries);
  const thumb = listProductThumbFromProduct(product);
  const nameSku = listProductNameSkuFields(product, {
    name: first.productName || (order && order.productName),
    sku: first.sku || (order && order.sku),
  });
  const ms = flowRecordsEarliestMs(sorted);
  const timeLabel = ms > 0 ? formatReportTime(new Date(ms).toISOString()) : formatReportTime(first.timestamp);
  const editParts = timestampToEditParts(first.timestamp);
  const sourceNodeId = first.type === 'REWORK' ? (first.sourceNodeId || first.nodeId) : first.nodeId;
  const sourceNode = nodesById.get(sourceNodeId);

  const qtyMap = {};
  sorted.forEach((r) => {
    const vid = r.variantId || '';
    qtyMap[vid] = String((Number(qtyMap[vid]) || 0) + (Number(r.quantity) || 0));
  });

  let matrixLayout = null;
  if (product && productHasColorSizeMatrix(product, category) && Object.keys(qtyMap).length > 0) {
    matrixLayout = buildVariantMatrixUiModel(product, dictionaries, qtyMap);
  }

  const lineItems = sorted.map((r) => {
    const variant = product && product.variants
      ? product.variants.find((v) => v.id === r.variantId)
      : null;
    const vLabel = variant ? variantLabel(variant, dictionaries) : '';
    const targetNodes = r.reworkNodeIds && r.reworkNodeIds.length > 0
      ? r.reworkNodeIds
      : (r.nodeId ? [r.nodeId] : []);
    const targetLabel = targetNodes.length
      ? targetNodes.map((nid) => (nodesById.get(nid) && nodesById.get(nid).name) || nid).join('、')
      : '';
    return {
      id: r.id,
      typeLabel: reworkTypeLabel(r),
      variantLabel: vLabel,
      showVariantLabel: Boolean(vLabel),
      qtyText: `${r.quantity} ${unitName}`,
      quantity: Number(r.quantity) || 0,
      variantId: r.variantId || '',
      targetLabel,
      showTarget: r.type === 'REWORK' && !!targetLabel,
      partner: (r.partner || '').trim(),
      showPartner: isOutsourceReworkRecord(r) && !!(r.partner || '').trim(),
      status: r.status || '',
    };
  });

  const total = sorted.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const reworkRec = sorted.find((r) => r.type === 'REWORK');
  const partnerLabels = collectOutsourcePartners(sorted);
  const partnerLabel = partnerLabels.join('、');

  return {
    docNo: first.docNo || '—',
    typeLabel: typeLabelFromRecords(sorted),
    orderNumber: (order && order.orderNumber) || first.orderNumber || '',
    productName: nameSku.productName,
    productSku: nameSku.productSku,
    showProductSku: nameSku.showProductSku,
    milestoneName: (sourceNode && sourceNode.name) || sourceNodeId || '—',
    partner: partnerLabel,
    showPartner: partnerLabels.length > 0,
    operator: first.operator || '—',
    timeLabel,
    editDate: editParts.date,
    editTime: editParts.time,
    totalQtyText: `${total} ${unitName}`,
    totalQuantity: total,
    sourceNodeName: (sourceNode && sourceNode.name) || sourceNodeId || '—',
    reworkStatus: reworkRec && reworkRec.status ? reworkRec.status : '',
    showReworkStatus: !!(reworkRec && reworkRec.status),
    matrixLayout,
    showMatrix: Boolean(matrixLayout),
    lineItems,
    showLineItems: !matrixLayout && lineItems.length > 0,
    records: sorted,
    productId: first.productId || '',
    orderId: first.orderId || '',
    ...thumb,
  };
}

module.exports = {
  buildDefectFlowDetailView,
};
