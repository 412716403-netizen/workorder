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
    timestamp,
  } = params;

  const collabExtra = buildDispatchCollabSnapshot(customValues, deliveryDate);
  const ts = timestamp || undefined;
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
        ...(ts ? { timestamp: ts } : {}),
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
        ...(ts ? { timestamp: ts } : {}),
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
    timestamp,
    weights,
  } = params;

  const { collectReceiveQuantityEntries } = require('./outsourceReceiveMatrix.js');
  const { distributeWeightByQty } = require('./bomWeightUsageLite.js');

  const ts = timestamp || undefined;
  const collabExtra = customValues && Object.keys(customValues).length
    ? { collabData: { ...customValues } }
    : {};

  const batch = [];
  const entries = collectReceiveQuantityEntries(rows, quantities);

  // 称重工序：行总重按数量分摊到组内各规格条目（对齐 Web buildWeightMapForKeyedEntries），后端按 variant BOM 固化快照
  const weightByEntry = new Map();
  if (weights) {
    const byBase = new Map();
    entries.forEach((e) => {
      const w = Number(weights[e.baseKey]) || 0;
      if (!(w > 0)) return;
      if (!byBase.has(e.baseKey)) byBase.set(e.baseKey, []);
      byBase.get(e.baseKey).push(e);
    });
    byBase.forEach((items, baseKey) => {
      const parts = distributeWeightByQty(
        Number(weights[baseKey]) || 0,
        items.map((it) => ({ quantity: it.quantity })),
      );
      items.forEach((it, idx) => {
        if (parts[idx] > 0) weightByEntry.set(it, parts[idx]);
      });
    });
  }

  entries.forEach((entry) => {
    const row = entry.row,baseKey = entry.baseKey,variantId = entry.variantId,qty = entry.quantity;
    const unitPrice = Number(unitPrices && unitPrices[baseKey]) || 0;
    const amount = unitPrice > 0 ? Math.round(unitPrice * qty * 100) / 100 : undefined;
    const entryWeight = weightByEntry.get(entry);
    const variantExtra = {
      ...(variantId ? { variantId } : {}),
      ...(entryWeight > 0 ? { weight: entryWeight } : {}),
    };

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
        ...(ts ? { timestamp: ts } : {}),
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
        ...(ts ? { timestamp: ts } : {}),
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
