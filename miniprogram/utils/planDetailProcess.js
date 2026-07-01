/**
 * 计划详情 - 工序任务只读模型（对齐 Web PlanDetailPanel §3）
 */

function buildPlanProcessNodes(product, globalNodes, assignments, nodeRates, workers, equipment) {
  if (!product || !product.milestoneNodeIds || !product.milestoneNodeIds.length) return [];

  const workerById = new Map((workers || []).map((w) => [w.id, w]));
  const equipById = new Map((equipment || []).map((e) => [e.id, e]));
  const rates = nodeRates || {};

  return product.milestoneNodeIds
    .map((id) => globalNodes.find((n) => n.id === id))
    .filter(Boolean)
    .map((node, idx) => {
      const assignment = (assignments && assignments[node.id]) || {};
      const workerNames = (assignment.workerIds || [])
        .map((id) => {
          const w = workerById.get(id);
          return w ? w.name : id;
        })
        .filter(Boolean);
      const equipNames = (assignment.equipmentIds || [])
        .map((id) => {
          const eq = equipById.get(id);
          return eq ? eq.name : id;
        })
        .filter(Boolean);
      const rate = rates[node.id];
      const hasRate = node.enablePieceRate && rate != null && rate !== '' && Number(rate) > 0;

      return {
        id: node.id,
        index: idx + 1,
        name: node.name,
        showRate: Boolean(node.enablePieceRate),
        rateText: hasRate ? `${Number(rate)} 元/件` : '—',
        showWorkers: workerNames.length > 0,
        workerText: workerNames.join('、'),
        showEquip: equipNames.length > 0,
        equipText: equipNames.join('、'),
        isAssigned: workerNames.length > 0 || equipNames.length > 0,
      };
    });
}

module.exports = {
  buildPlanProcessNodes,
};
