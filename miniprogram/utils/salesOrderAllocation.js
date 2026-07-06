/**
 * 销售订单配货保存（对齐 Web AllocationModal）
 */

const { effectiveAllocatedQuantity } = require('./psiAllocationDisplay.js');
const { formatPsiQtyDisplay } = require('./psiOpsAggregators.js');

function computeInitialAllocationQuantities(grp) {
  const hasVariants = (grp || []).some((i) => i.variantId);
  if (hasVariants) {
    const next = {};
    (grp || []).forEach((i) => {
      if (!i.variantId) return;
      const orderQty = formatPsiQtyDisplay(i.quantity);
      const eff = effectiveAllocatedQuantity(i.allocatedQuantity, i.shippedQuantity);
      next[i.variantId] = Math.max(0, orderQty - eff);
    });
    return next;
  }
  const orderTotal = (grp || []).reduce((s, i) => s + formatPsiQtyDisplay(i.quantity), 0);
  const displayAllocatedTotal = (grp || []).reduce(
    (s, i) => s + effectiveAllocatedQuantity(i.allocatedQuantity, i.shippedQuantity),
    0,
  );
  return Math.max(0, orderTotal - displayAllocatedTotal);
}

function buildAllocationSaveRecords(docRecords, grp, allocationQuantities, warehouseId) {
  const grpIds = new Set((grp || []).map((g) => g.id));
  return (docRecords || []).map((r) => {
    if (!grpIds.has(r.id)) return r;
    const inGrp = (grp || []).find((g) => g.id === r.id);
    if (!inGrp) return r;
    let remaining = 0;
    if (typeof allocationQuantities === 'object' && inGrp.variantId) {
      remaining = Number(allocationQuantities[inGrp.variantId]) || 0;
    } else if (typeof allocationQuantities === 'number') {
      remaining = allocationQuantities;
    }
    return {
      ...r,
      allocatedQuantity: (Number(r.allocatedQuantity) || 0) + remaining,
      allocationWarehouseId: warehouseId,
    };
  });
}

module.exports = {
  computeInitialAllocationQuantities,
  buildAllocationSaveRecords,
};
