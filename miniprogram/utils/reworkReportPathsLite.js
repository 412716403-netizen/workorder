/**
 * 返工报工路径（工单模式精简版，对齐 utils/reworkReportGroup.ts）
 */

function buildOutOfSequenceTemplateIds(nodes) {
  const set = new Set();
  (nodes || []).forEach((n) => {
    if (n.allowOutOfSequence) set.add(n.id);
  });
  return set;
}

function isProcessSequential(nodeId, outOfSequenceTemplateIds) {
  if (nodeId && outOfSequenceTemplateIds && outOfSequenceTemplateIds.has(nodeId)) return false;
  return true;
}

function findGatingPredecessorIndex(templateIds, currentIndex, outOfSequenceTemplateIds) {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const tid = templateIds[i];
    if (!tid) continue;
    if (!outOfSequenceTemplateIds || !outOfSequenceTemplateIds.has(tid)) return i;
  }
  return -1;
}

function reworkRemainingAtNode(r, nodeId, outOfSequenceTemplateIds) {
  const pathNodes =
    r.reworkNodeIds && r.reworkNodeIds.length > 0
      ? r.reworkNodeIds
      : r.nodeId
        ? [r.nodeId]
        : [];
  const idx = pathNodes.indexOf(nodeId);
  if (idx < 0) return 0;
  const doneAtNode =
    (r.reworkCompletedQuantityByNode && r.reworkCompletedQuantityByNode[nodeId]) ??
    ((r.completedNodeIds || []).includes(nodeId) ? r.quantity : 0);
  if (isProcessSequential(nodeId, outOfSequenceTemplateIds)) {
    const gateIdx = findGatingPredecessorIndex(pathNodes, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      const prevNodeId = pathNodes[gateIdx];
      const doneAtPrev =
        (r.reworkCompletedQuantityByNode && r.reworkCompletedQuantityByNode[prevNodeId]) ?? 0;
      return Math.max(0, Math.min(doneAtPrev, r.quantity) - doneAtNode);
    }
  }
  return Math.max(0, r.quantity - doneAtNode);
}

function buildReworkReportPaths(records, currentNodeId, globalNodes, scopeOrderId) {
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(globalNodes);

  const reworkList = records.filter((r) => {
    if (r.type !== 'REWORK') return false;
    if (scopeOrderId && r.orderId !== scopeOrderId) return false;
    if ((r.partner ?? '').trim()) return false;
    const pathNodes =
      r.reworkNodeIds && r.reworkNodeIds.length > 0
        ? r.reworkNodeIds
        : r.nodeId
          ? [r.nodeId]
          : [];
    if (!pathNodes.includes(currentNodeId)) return false;
    if (r.status === '已完成') return false;
    const remaining = reworkRemainingAtNode(r, currentNodeId, outOfSequenceTemplateIds);
    return remaining > 0;
  });

  const byKey = new Map();
  reworkList.forEach((r) => {
    const productId = r.productId;
    if (!productId) return;
    const pathNodes =
      r.reworkNodeIds && r.reworkNodeIds.length > 0
        ? r.reworkNodeIds
        : r.nodeId
          ? [r.nodeId]
          : [];
    const pathKey = pathNodes.join('|');
    const mapKey = `${productId}::${pathKey}`;
    const cur = byKey.get(mapKey) || { productId, records: [], pendingByVariant: {} };
    cur.records.push(r);
    const remaining = reworkRemainingAtNode(r, currentNodeId, outOfSequenceTemplateIds);
    const vid = r.variantId ?? '';
    cur.pendingByVariant[vid] = (cur.pendingByVariant[vid] ?? 0) + remaining;
    byKey.set(mapKey, cur);
  });

  const rows = [];
  byKey.forEach(({ productId, records: recs, pendingByVariant }) => {
    const first = recs[0];
    const pathNodes =
      first && first.reworkNodeIds && first.reworkNodeIds.length > 0
        ? first.reworkNodeIds
        : first && first.nodeId
          ? [first.nodeId]
          : [];
    const pathKey = pathNodes.join('|');
    const nodeIds = pathKey.split('|').filter(Boolean);
    const pathLabel =
      nodeIds.length <= 1
        ? (globalNodes.find((n) => n.id === nodeIds[0])?.name ?? nodeIds[0])
        : nodeIds.map((nid) => globalNodes.find((n) => n.id === nid)?.name ?? nid).join('、');
    const totalPending = Object.values(pendingByVariant).reduce((s, q) => s + q, 0);
    if (totalPending > 0) {
      rows.push({ productId, pathKey, pathLabel, nodeIds, records: recs, totalPending, pendingByVariant });
    }
  });

  rows.sort((a, b) => a.productId.localeCompare(b.productId));
  return rows;
}

function findReworkPathForScan(paths, productId, variantId) {
  const productPaths = paths.filter((p) => p.productId === productId);
  if (variantId) {
    return productPaths.find((p) => (p.pendingByVariant[variantId] ?? 0) > 0);
  }
  return productPaths.find((p) => p.totalPending > 0) ?? productPaths[0];
}

function collectReworkOrderIdsForProduct(paths, productId, fallbackOrderId) {
  const ids = new Set();
  paths
    .filter((p) => p.productId === productId)
    .forEach((p) => {
      p.records.forEach((r) => {
        if (r.orderId) ids.add(r.orderId);
      });
    });
  if (ids.size === 0 && fallbackOrderId) ids.add(fallbackOrderId);
  return [...ids];
}

/** 列出工单下有待返工量的工序节点 id */
function listReworkNodeIdsWithPending(records, orderId, globalNodes) {
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(globalNodes);
  const nodeIds = new Set();
  records.forEach((r) => {
    if (r.type !== 'REWORK') return;
    if (orderId && r.orderId !== orderId) return;
    if ((r.partner ?? '').trim()) return;
    const pathNodes =
      r.reworkNodeIds && r.reworkNodeIds.length > 0
        ? r.reworkNodeIds
        : r.nodeId
          ? [r.nodeId]
          : [];
    pathNodes.forEach((nid) => {
      if (reworkRemainingAtNode(r, nid, outOfSequenceTemplateIds) > 0) nodeIds.add(nid);
    });
  });
  return [...nodeIds];
}

module.exports = {
  buildReworkReportPaths,
  findReworkPathForScan,
  collectReworkOrderIdsForProduct,
  listReworkNodeIdsWithPending,
};
