/** 计划单下达后关联工单：优先根工单，否则取工单号排序后的第一条。 */
function resolvePrimaryOrderIdForPlan(planId, orders) {
  const linked = (orders || []).filter((o) => o && o.planOrderId === planId);
  if (!linked.length) return null;
  const roots = linked.filter((o) => !o.parentOrderId);
  const candidates = roots.length > 0 ? roots : linked;
  const sorted = candidates.slice().sort((a, b) =>
    String(a.orderNumber || '').localeCompare(String(b.orderNumber || ''), 'zh-CN')
  );
  return sorted[0] && sorted[0].id ? sorted[0].id : null;
}

module.exports = { resolvePrimaryOrderIdForPlan };
