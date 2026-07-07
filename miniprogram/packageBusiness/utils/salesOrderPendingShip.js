/**
 * 待发货生成销售单 / 配货详情（对齐 Web PendingShipmentListModal、PendingShipDetailModal）
 */

const { linePendingShipQty } = require('./psiAllocationDisplay.js');
const { localTodayYmd } = require('./dateYmd.js');
const { variantLabel } = require('./productionPlans.js');

function resolveVariantSpecLabel(variant, dictionaries) {
  if (!variant) return '—';
  return variantLabel(variant, dictionaries) || variant.id || '—';
}

function buildPendingShipDetailViewModel(group, product, dictionaries) {
  const records = group.records || [];
  const hasVariants = records.some((r) => r.variantId) && product && (product.variants || []).length > 0;
  const lineItems = records.map((r) => {
    const pending = linePendingShipQty(r);
    const allocated = Number(r.allocatedQuantity) || 0;
    const shipped = Number(r.shippedQuantity) || 0;
    let specLabel = '数量';
    if (r.variantId && product) {
      const v = (product.variants || []).find((vv) => vv.id === r.variantId);
      specLabel = resolveVariantSpecLabel(v, dictionaries);
    }
    return {
      id: r.id,
      variantId: r.variantId || '',
      specLabel,
      pendingQty: pending,
      pendingText: String(pending),
      allocatedText: String(allocated),
      shippedText: String(shipped),
      editQty: String(pending),
    };
  });
  const totalPending = lineItems.reduce((s, l) => s + l.pendingQty, 0);
  return {
    docNumber: group.docNumber,
    partner: group.partner,
    productName: group.productName,
    productSku: group.productSku,
    showProductSku: Boolean(group.showProductSku),
    warehouseId: group.warehouseId,
    warehouseName: group.warehouseName,
    hasVariants,
    lineItems,
    totalPending,
    totalPendingText: String(totalPending),
  };
}

function collectEditQuantitiesFromLineItems(lineItems, hasVariants) {
  if (!hasVariants) {
    const first = (lineItems || [])[0];
    return Number(first && first.editQty) || 0;
  }
  const out = {};
  (lineItems || []).forEach((item) => {
    if (item.variantId) out[item.variantId] = Number(item.editQty) || 0;
  });
  return out;
}

function sumEditQuantities(editQuantities, hasVariants) {
  if (!hasVariants) return Number(editQuantities) || 0;
  return Object.values(editQuantities || {}).reduce((s, n) => s + (Number(n) || 0), 0);
}

function buildPendingShipEditSaveRecords(docRecords, group, editQuantities, warehouseId) {
  const groupIds = new Set((group.records || []).map((r) => r.id));
  const hasVariants = (group.records || []).some((r) => r.variantId);
  return (docRecords || []).map((re) => {
    if (!groupIds.has(re.id)) return re;
    const base = { ...re, allocationWarehouseId: warehouseId || re.allocationWarehouseId };
    const shipped = Number(re.shippedQuantity) || 0;
    if (hasVariants && re.variantId) {
      const pendingEdit = Number((editQuantities || {})[re.variantId]) || 0;
      return { ...base, allocatedQuantity: shipped + Math.max(0, pendingEdit) };
    }
    if (!hasVariants) {
      const pendingEdit = typeof editQuantities === 'number' ? editQuantities : 0;
      return { ...base, allocatedQuantity: shipped + Math.max(0, pendingEdit) };
    }
    return base;
  });
}

function buildPendingShipDeleteRecords(docRecords, group) {
  const groupIds = new Set((group.records || []).map((r) => r.id));
  return (docRecords || []).map((re) => {
    if (!groupIds.has(re.id)) return re;
    return { ...re, allocatedQuantity: 0 };
  });
}

function buildSalesBillRecordsFromPending(selectedRecords, docNumber, operator) {
  if (!selectedRecords || !selectedRecords.length) return [];
  const first = selectedRecords[0];
  const partnerName = first.partner || '';
  const partnerId = first.partnerId || '';
  const warehouseId = first.allocationWarehouseId || first.warehouseId || '';
  const createdAt = localTodayYmd();
  const timestamp = new Date().toISOString();
  let recIdx = 0;
  return selectedRecords.map((r) => {
    const pendingQty = linePendingShipQty(r);
    const price = Number(r.salesPrice) || 0;
    return {
      id: `psi-sb-${Date.now()}-${recIdx++}`,
      type: 'SALES_BILL',
      docNumber,
      timestamp,
      _savedAtMs: Date.now(),
      partner: partnerName,
      partnerId,
      warehouseId,
      productId: r.productId,
      variantId: r.variantId,
      quantity: pendingQty,
      salesPrice: price,
      amount: pendingQty * price,
      note: '',
      operator: operator || '',
      lineGroupId: r.lineGroupId || r.id,
      createdAt,
    };
  });
}

function buildShippedOrderUpdates(docRecords, shippedRecordIds) {
  const idSet = new Set(shippedRecordIds || []);
  return (docRecords || []).map((re) => {
    if (!idSet.has(re.id)) return re;
    const allocated = Number(re.allocatedQuantity) || 0;
    const alreadyShipped = Number(re.shippedQuantity) || 0;
    const pending = Math.max(0, allocated - alreadyShipped);
    return { ...re, shippedQuantity: alreadyShipped + pending };
  });
}

module.exports = {
  buildSalesBillRecordsFromPending,
  buildShippedOrderUpdates,
  buildPendingShipDetailViewModel,
  collectEditQuantitiesFromLineItems,
  sumEditQuantities,
  buildPendingShipEditSaveRecords,
  buildPendingShipDeleteRecords,
};
