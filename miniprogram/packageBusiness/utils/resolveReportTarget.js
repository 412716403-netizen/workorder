/**
 * 报工：仅预选工序模板时，按扫码结果反查工单 + 里程碑实例（对齐 Web resolveOrdersForProductAtTemplate）
 */

function resolveOrdersForProductAtTemplate(orders, productId, templateId) {
  return orders.filter(
    (o) =>
      o.productId === productId
      && Array.isArray(o.milestones)
      && o.milestones.some((m) => m.templateId === templateId),
  );
}

/**
 * @param {object} scanRes
 * @param {string} templateId 工序模板 id（global node）
 * @param {object[]} orders 含 milestones 的工单列表
 */
function resolveReportTarget(scanRes, templateId, orders) {
  const productId = scanRes.productId;
  if (!productId || !templateId) return null;

  let candidates = resolveOrdersForProductAtTemplate(orders, productId, templateId);
  if (candidates.length === 0) return null;

  const planOrderId = scanRes.planOrderId || null;
  if (planOrderId) {
    const byPlan = candidates.filter((o) => o.planOrderId === planOrderId);
    if (byPlan.length === 1) candidates = byPlan;
    else if (byPlan.length > 1) candidates = byPlan;
    else return null;
  }

  const orderNumbers = Array.isArray(scanRes.orderNumbers) ? scanRes.orderNumbers : [];
  if (orderNumbers.length > 0) {
    const byNo = candidates.filter((o) => orderNumbers.includes(o.orderNumber));
    if (byNo.length === 1) candidates = byNo;
    else if (byNo.length === 0) return null;
    else candidates = byNo;
  }

  if (candidates.length !== 1) {
    return candidates.length > 1 ? { error: 'MULTIPLE_ORDERS' } : null;
  }

  const order = candidates[0];
  const milestone = (order.milestones || []).find((m) => m.templateId === templateId);
  if (!milestone) return null;

  return {
    orderId: order.id,
    orderLabel: order.orderNumber || order.productName || order.id,
    productId: order.productId,
    milestoneId: milestone.id,
    milestoneName: milestone.name,
  };
}

module.exports = {
  resolveReportTarget,
  resolveOrdersForProductAtTemplate,
};
