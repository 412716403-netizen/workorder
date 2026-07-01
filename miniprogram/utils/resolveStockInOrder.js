/**
 * 入库扫码：按码上产品/计划信息匹配待入库工单（简化版 Web findPendingStockRowForScan）
 */

function resolveStockInOrder(scanRes, orders) {
  const productId = scanRes.productId;
  if (!productId) return null;

  let candidates = orders.filter((o) => o.productId === productId);
  if (candidates.length === 0) return null;

  const planOrderId = scanRes.planOrderId || null;
  if (planOrderId) {
    const byPlan = candidates.filter((o) => o.planOrderId === planOrderId);
    if (byPlan.length === 1) return byPlan[0];
    if (byPlan.length > 0) candidates = byPlan;
  }

  const orderNumbers = Array.isArray(scanRes.orderNumbers) ? scanRes.orderNumbers : [];
  if (orderNumbers.length > 0) {
    const byNo = candidates.filter((o) => orderNumbers.includes(o.orderNumber));
    if (byNo.length === 1) return byNo[0];
    if (byNo.length > 0) candidates = byNo;
  }

  if (candidates.length === 1) return candidates[0];
  return candidates.length > 1 ? { error: 'MULTIPLE_ORDERS' } : null;
}

module.exports = {
  resolveStockInOrder,
};
