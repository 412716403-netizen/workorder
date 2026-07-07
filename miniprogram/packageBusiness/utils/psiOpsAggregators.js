/**
 * PSI 记录聚合纯函数（对齐 utils/psiOpsAggregators.ts）
 */

function groupRecordsByDocNumber(records, type) {
  const filtered = (records || []).filter((r) => r.type === type);
  const groups = {};
  filtered.forEach((r) => {
    const key = r.docNumber || `UNGROUPED-${r.id}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return groups;
}

function sumReceivedByOrderLine(records) {
  const map = {};
  (records || [])
    .filter((r) => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId)
    .forEach((r) => {
      const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
      map[key] = (map[key] || 0) + (Number(r.quantity) || 0);
    });
  return map;
}

function formatPsiQtyDisplay(q) {
  if (q == null || q === '') return 0;
  const n = Number(q);
  return Number.isFinite(n) ? n : 0;
}

function purchaseOrderDocHasUnsettled(docNumber, docItems, receivedByOrderLine) {
  return (docItems || []).some(
    (item) => (Number(item.quantity) || 0) > (receivedByOrderLine[`${docNumber}::${item.id}`] ?? 0),
  );
}

function groupDocItemsByLineGroup(docItems) {
  const lineGroups = {};
  (docItems || []).forEach((item) => {
    const lg = item.lineGroupId || item.id;
    if (!lineGroups[lg]) lineGroups[lg] = [];
    lineGroups[lg].push(item);
  });
  return lineGroups;
}

function lineGroupTotalQty(items) {
  return (items || []).reduce((s, i) => s + formatPsiQtyDisplay(i.quantity), 0);
}

function lineGroupTotalAmount(items) {
  return (items || []).reduce((s, i) => {
    const qty = formatPsiQtyDisplay(i.quantity);
    return s + qty * (Number(i.purchasePrice) || 0);
  }, 0);
}

module.exports = {
  groupRecordsByDocNumber,
  sumReceivedByOrderLine,
  formatPsiQtyDisplay,
  purchaseOrderDocHasUnsettled,
  groupDocItemsByLineGroup,
  lineGroupTotalQty,
  lineGroupTotalAmount,
};
