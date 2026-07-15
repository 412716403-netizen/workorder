/**
 * 外协流水单据详情视图（对齐报工批次详情 plan-detail-shell 只读部分）
 */

const { formatReportTime } = require('../../utils/orderReportHistory.js');
const { flowRecordsEarliestMs } = require('../../utils/flowDocSortLite.js');
const { listProductThumbFromProduct, listProductNameSkuFields } = require('../../utils/listProductThumb.js');
const { productHasColorSizeMatrix, variantLabel } = require('../../utils/productionPlans.js');
const { buildVariantMatrixUiModel } = require('../../utils/variantQtyMatrix.js');
const { getProductUnitName } = require('../../utils/planFormCustomField.js');
const { timestampToEditParts } = require('./reportBatchDetail.js');

function formatAmount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  return v.toFixed(2);
}

function maskAmount(value, canViewAmount) {
  if (!canViewAmount) return '***';
  if (value == null || value === '') return '—';
  const v = Number(value);
  if (!Number.isFinite(v)) return String(value);
  return formatAmount(v) || '—';
}

function maskAmountCurrency(value, canViewAmount) {
  if (!canViewAmount) return '***';
  const text = formatAmount(value);
  return text ? `¥${text}` : '—';
}

function resolveSectionUnitPrice(list) {
  for (let i = 0; i < (list || []).length; i += 1) {
    const up = Number(list[i].unitPrice);
    if (Number.isFinite(up) && up > 0) return up;
  }
  const total = (list || []).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmount = (list || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (total > 0 && totalAmount > 0) return totalAmount / total;
  return 0;
}

function formatSectionUnitPriceText(unitPrice, unitName, canViewAmount) {
  if (!canViewAmount) return '***';
  const up = Number(unitPrice);
  if (Number.isFinite(up) && up > 0) {
    return `${up.toFixed(2)} 元/${unitName || '件'}`;
  }
  return '—';
}

function buildSectionDetail(records, ctx) {
  const {
    product,
    category,
    dictionaries,
    unitName,
    canViewAmount,
    productsById,
  } = ctx;

  const list = records || [];
  const qtyMap = {};
  list.forEach((r) => {
    if (r.variantId) {
      qtyMap[r.variantId] = String((Number(qtyMap[r.variantId]) || 0) + (Number(r.quantity) || 0));
    }
  });

  let matrixLayout = null;
  if (product && productHasColorSizeMatrix(product, category) && Object.keys(qtyMap).length > 0) {
    matrixLayout = buildVariantMatrixUiModel(product, dictionaries, qtyMap);
  }
  const showMatrix = Boolean(matrixLayout);

  const lineItems = list.map((r) => {
    const rowProduct = productsById.get(r.productId) || product;
    const variant = rowProduct && rowProduct.variants
      ? rowProduct.variants.find((v) => v.id === r.variantId)
      : null;
    const vLabel = variant ? variantLabel(variant, dictionaries) : '';
    const qty = Number(r.quantity) || 0;
    const amount = Number(r.amount) || 0;
    const unitPrice = r.unitPrice;
    const weight = r.weight != null && r.weight !== '' ? Number(r.weight) : null;
    return {
      id: r.id,
      productName: (rowProduct && rowProduct.name) || r.productName || '—',
      variantLabel: vLabel,
      showVariantLabel: Boolean(vLabel),
      qtyText: `${qty} ${unitName}`,
      unitPriceText: maskAmount(unitPrice, canViewAmount),
      amountText: maskAmountCurrency(amount, canViewAmount),
      showUnitPrice: canViewAmount,
      showAmount: canViewAmount && amount > 0,
      weightText: Number.isFinite(weight) && weight > 0 ? `${weight} kg` : '',
      showWeight: Number.isFinite(weight) && weight > 0,
      operator: r.operator || '',
      showOperator: Boolean(r.operator),
    };
  });

  const total = list.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmount = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const sectionUnitPrice = resolveSectionUnitPrice(list);

  return {
    total,
    totalText: `${total} ${unitName}`,
    totalAmount,
    totalAmountText: maskAmountCurrency(totalAmount, canViewAmount),
    showAmount: canViewAmount && totalAmount > 0,
    unitPrice: sectionUnitPrice,
    unitPriceText: formatSectionUnitPriceText(sectionUnitPrice, unitName, canViewAmount),
    showUnitPrice: canViewAmount,
    matrixLayout,
    showMatrix,
    lineItems,
    showLineItems: !showMatrix && lineItems.length > 0,
  };
}

function buildOutsourceFlowDetailView(params) {
  const {
    docNo,
    records = [],
    ordersById = new Map(),
    productsById = new Map(),
    nodesById = new Map(),
    categoryMap = new Map(),
    dictionaries = {},
    productionLinkMode = 'order',
    canViewAmount = false,
  } = params;

  const sorted = [...records].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  const first = sorted[0] || {};
  const order = first.orderId ? ordersById.get(first.orderId) : null;
  const product = productsById.get(first.productId || (order && order.productId));
  const category = product && product.categoryId ? categoryMap.get(product.categoryId) : null;
  const node = nodesById.get(first.nodeId);
  const unitName = getProductUnitName(product, dictionaries);
  const isProductMode = productionLinkMode === 'product';
  const ms = flowRecordsEarliestMs(sorted);
  const timeLabel = ms > 0
    ? formatReportTime(new Date(ms).toISOString())
    : formatReportTime(first.timestamp);

  const dispatchRows = sorted.filter((r) => r.status !== '已收回');
  const receiveRows = sorted.filter((r) => r.status === '已收回');

  const sectionCtx = {
    product,
    category,
    dictionaries,
    unitName,
    canViewAmount,
    productsById,
  };

  const dispatchSection = buildSectionDetail(dispatchRows, sectionCtx);
  const receiveSection = buildSectionDetail(receiveRows, sectionCtx);

  const totalAmount = dispatchSection.totalAmount + receiveSection.totalAmount;
  const partnerLabel = first.partner || '—';
  const milestoneLabel = (node && node.name) || first.nodeId || '—';
  const milestonePartnerLine = partnerLabel !== '—'
    ? `${milestoneLabel} · ${partnerLabel}`
    : milestoneLabel;
  const thumb = listProductThumbFromProduct(product);
  const nameSku = listProductNameSkuFields(product, {
    name: first.productName || (order && order.productName),
    sku: first.sku || (order && order.sku),
  });

  const typeLabel = dispatchRows.length && receiveRows.length
    ? '发出、收回'
    : (receiveRows.length ? '外协收回' : '外协发出');
  const tsParts = timestampToEditParts(ms > 0 ? new Date(ms).toISOString() : first.timestamp);

  return {
    docNo: docNo || first.docNo || '—',
    typeLabel,
    timeLabel,
    operator: first.operator || '—',
    partner: partnerLabel,
    showPartner: partnerLabel !== '—',
    milestoneName: milestoneLabel,
    milestonePartnerLine,
    orderNumber: (order && order.orderNumber) || first.orderNumber || '',
    showOrderNumber: !isProductMode && !!((order && order.orderNumber) || first.orderNumber),
    productName: nameSku.productName,
    productSku: nameSku.productSku,
    showProductSku: nameSku.showProductSku,
    unitName,
    dispatchSection,
    receiveSection,
    hasDispatch: dispatchRows.length > 0,
    hasReceive: receiveRows.length > 0,
    dispatchTotalText: dispatchSection.totalText,
    receiveTotalText: receiveSection.totalText,
    receiveUnitPriceText: receiveSection.unitPriceText,
    showReceiveUnitPrice: canViewAmount && receiveRows.length > 0,
    totalAmountText: maskAmountCurrency(totalAmount, canViewAmount),
    showTotalAmount: canViewAmount && totalAmount > 0,
    editDate: tsParts.date,
    editTime: tsParts.time,
    editOperator: first.operator || '',
    ...thumb,
  };
}

module.exports = {
  buildOutsourceFlowDetailView,
};
