/**
 * 外协发出/收回确认 payload（对齐 Web OutsourcePanel 提交逻辑）
 */

const { nextOutsourceDocNumber } = require('./partnerDocNumberLite.js');
const { outsourceReceiveBaseKey } = require('./outsourceReceiveKeys.js');

const OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY = 'outsourceDispatchDeliveryDate';

function buildDispatchCollabSnapshot(customValues, deliveryDate) {
  const collabData = {};
  if (customValues && typeof customValues === 'object') {
    Object.assign(collabData, customValues);
  }
  if (deliveryDate && String(deliveryDate).trim()) {
    collabData[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY] = String(deliveryDate).trim().slice(0, 10);
  }
  return Object.keys(collabData).length ? { collabData } : {};
}

function validateReceiveQty(qty, pending, allowExceed) {
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) return '请输入有效数量';
  if (!allowExceed && q > pending) return `不能超过待收回 ${pending}`;
  return null;
}

function buildDispatchBatchPayload(params) {
  const {
    rows,
    quantities,
    partnerName,
    operator,
    productionLinkMode,
    ordersById,
    deliveryDate,
    customValues,
  } = params;

  const collabExtra = buildDispatchCollabSnapshot(customValues, deliveryDate);
  const batch = [];
  const { collectDispatchQuantityEntries } = require('./outsourceDispatchMatrix.js');
  const entries = collectDispatchQuantityEntries(rows, quantities);

  entries.forEach(({ row, variantId, quantity: qty }) => {
    const variantField = variantId ? { variantId } : {};

    if (productionLinkMode === 'product' || !row.orderId) {
      batch.push({
        type: 'OUTSOURCE',
        productId: row.productId,
        quantity: qty,
        operator: operator || '',
        status: '加工中',
        partner: partnerName,
        nodeId: row.nodeId,
        ...variantField,
        ...collabExtra,
      });
    } else {
      const order = ordersById.get(row.orderId);
      if (!order) return;
      batch.push({
        type: 'OUTSOURCE',
        orderId: row.orderId,
        productId: order.productId,
        quantity: qty,
        operator: operator || '',
        status: '加工中',
        partner: partnerName,
        nodeId: row.nodeId,
        ...variantField,
        ...collabExtra,
      });
    }
  });

  return batch;
}

function buildReceiveBatchPayload(params) {
  const {
    rows,
    quantities,
    unitPrices,
    operator,
    ordersById,
    customValues,
  } = params;

  const { collectReceiveQuantityEntries } = require('./outsourceReceiveMatrix.js');

  const collabExtra = customValues && Object.keys(customValues).length
    ? { collabData: { ...customValues } }
    : {};

  const batch = [];
  const entries = collectReceiveQuantityEntries(rows, quantities);
  entries.forEach(({ row, baseKey, variantId, quantity: qty }) => {
    const unitPrice = Number(unitPrices && unitPrices[baseKey]) || 0;
    const amount = unitPrice > 0 ? Math.round(unitPrice * qty * 100) / 100 : undefined;
    const variantExtra = variantId ? { variantId } : {};

    if (row.orderId) {
      const order = ordersById.get(row.orderId);
      if (!order) return;
      batch.push({
        type: 'OUTSOURCE',
        orderId: row.orderId,
        productId: order.productId,
        quantity: qty,
        operator: operator || '',
        status: '已收回',
        partner: row.partner,
        nodeId: row.nodeId,
        unitPrice: unitPrice > 0 ? unitPrice : undefined,
        amount,
        ...variantExtra,
        ...collabExtra,
      });
    } else {
      batch.push({
        type: 'OUTSOURCE',
        productId: row.productId,
        quantity: qty,
        operator: operator || '',
        status: '已收回',
        partner: row.partner,
        nodeId: row.nodeId,
        unitPrice: unitPrice > 0 ? unitPrice : undefined,
        amount,
        ...variantExtra,
        ...collabExtra,
      });
    }
  });

  return batch;
}

function resolveOutsourceDocNo(kind, partners, records, partnerName) {
  return nextOutsourceDocNumber(kind, partners, records, '', partnerName);
}

module.exports = {
  buildDispatchBatchPayload,
  buildReceiveBatchPayload,
  validateReceiveQty,
  resolveOutsourceDocNo,
  OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY,
};
