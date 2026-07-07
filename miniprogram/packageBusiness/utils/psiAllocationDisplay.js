/**
 * 销售订单配货展示（对齐 utils/psiAllocationDisplay.ts）
 */

function effectiveAllocatedQuantity(allocatedQuantity, shippedQuantity) {
  const a = Number(allocatedQuantity) || 0;
  const s = Number(shippedQuantity) || 0;
  return s + Math.max(0, a - s);
}

function linePendingShipQty(record) {
  const allocated = Number(record && record.allocatedQuantity) || 0;
  const shipped = Number(record && record.shippedQuantity) || 0;
  return Math.max(0, allocated - shipped);
}

module.exports = {
  effectiveAllocatedQuantity,
  linePendingShipQty,
};
