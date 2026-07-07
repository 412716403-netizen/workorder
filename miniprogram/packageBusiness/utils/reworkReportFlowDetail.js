/**
 * 返工报工流水详情视图
 */

const { formatReportTime } = require('./orderReportHistory.js');
const { flowRecordsEarliestMs } = require('./flowDocSortLite.js');
const { listProductThumbFromProduct, listProductNameSkuFields } = require('./listProductThumb.js');
const { productHasColorSizeMatrix, variantLabel } = require('./productionPlans.js');
const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
const { getProductUnitName } = require('./planFormCustomField.js');
const { timestampToEditParts } = require('./reportBatchDetail.js');
const {
  buildReworkByIdMap,
  buildReworkReportOperatorsLabel,
  buildReworkReportOutsourcePartnerDisplay,
} = require('./reworkReportOperator.js');

function buildReworkReportFlowDetailView(records, ctx) {
  const {
    ordersById = new Map(),
    productsById = new Map(),
    nodesById = new Map(),
    categoriesById = new Map(),
    dictionaries = {},
    workersById = new Map(),
    equipmentById = new Map(),
    canViewAmount = true,
  } = ctx || {};

  const sorted = [...(records || [])].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  if (!sorted.length) return null;
  const first = sorted[0];
  const reworkById = ctx.reworkById || buildReworkByIdMap(ctx.allRecords || records);
  const outsourcePartnerDisplay = buildReworkReportOutsourcePartnerDisplay(sorted, reworkById);
  const isOutsourceReworkReport = outsourcePartnerDisplay.length > 0;
  const operatorsLabel = buildReworkReportOperatorsLabel(sorted, reworkById);
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
  const node = nodesById.get(first.nodeId);

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
    const amount = Number(r.amount) || 0;
    const unitPrice = Number(r.unitPrice) || 0;
    return {
      id: r.id,
      variantLabel: vLabel,
      showVariantLabel: Boolean(vLabel),
      qtyText: `${r.quantity} ${unitName}`,
      quantity: Number(r.quantity) || 0,
      variantId: r.variantId || '',
      unitPriceText: canViewAmount && unitPrice > 0 ? `${unitPrice.toFixed(2)}` : '',
      amountText: canViewAmount && amount > 0 ? `¥${amount.toFixed(2)}` : '',
      showAmount: canViewAmount && amount > 0,
    };
  });

  const total = sorted.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmount = sorted.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const unitPrice = Number(first.unitPrice) || 0;
  const worker = first.workerId ? workersById.get(first.workerId) : null;
  const equipment = first.equipmentId ? equipmentById.get(first.equipmentId) : null;

  return {
    docNo: first.docNo || '—',
    orderNumber: (order && order.orderNumber) || first.orderNumber || '',
    productName: nameSku.productName,
    productSku: nameSku.productSku,
    showProductSku: nameSku.showProductSku,
    milestoneName: (node && node.name) || first.nodeId || '—',
    operator: isOutsourceReworkReport ? outsourcePartnerDisplay : operatorsLabel,
    isOutsourceReworkReport,
    outsourcePartnerDisplay,
    showOutsourcePartner: isOutsourceReworkReport && !!outsourcePartnerDisplay,
    showOperator: !isOutsourceReworkReport && operatorsLabel !== '—',
    operatorsLabel,
    workerName: (worker && worker.name) || '',
    showWorker: !!(worker && worker.name),
    equipmentName: (equipment && equipment.name) || '',
    showEquipment: !!(equipment && equipment.name),
    timeLabel,
    editDate: editParts.date,
    editTime: editParts.time,
    totalQtyText: `${total} ${unitName}`,
    totalQuantity: total,
    totalAmount,
    totalAmountText: canViewAmount && totalAmount > 0 ? `¥${totalAmount.toFixed(2)}` : '',
    showTotalAmount: canViewAmount && totalAmount > 0,
    unitPrice,
    unitPriceText: canViewAmount && unitPrice > 0 ? `${unitPrice.toFixed(2)} 元/${unitName}` : '',
    showUnitPrice: canViewAmount && unitPrice > 0,
    matrixLayout,
    showMatrix: Boolean(matrixLayout),
    lineItems,
    showLineItems: !matrixLayout && lineItems.length > 0,
    records: sorted,
    productId: first.productId || '',
    orderId: first.orderId || '',
    nodeId: first.nodeId || '',
    workerId: first.workerId || '',
    equipmentId: first.equipmentId || '',
    ...thumb,
  };
}

module.exports = {
  buildReworkReportFlowDetailView,
};
