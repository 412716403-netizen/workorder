/**
 * 返工目标工序选项（对齐 Web ReworkDefectiveActionModal.renderNodeSelector）
 */

function buildReworkTargetNodeOptions(product, nodes, nodesById, checkedIds) {
  const checked = new Set(checkedIds || []);
  const seq = (product && product.milestoneNodeIds) || [];
  const productNodes = [];
  seq.forEach((nid, stepIdx) => {
    if (!nid) return;
    const node = nodesById.get(nid);
    productNodes.push({
      id: nid,
      name: (node && node.name) || nid,
      stepLabel: `第${stepIdx + 1}道`,
      checked: checked.has(nid),
    });
  });

  const otherNodes = [];
  (nodes || []).forEach((n) => {
    if (!n || !n.id) return;
    if (seq.includes(n.id)) return;
    otherNodes.push({
      id: n.id,
      name: n.name || n.id,
      checked: checked.has(n.id),
    });
  });
  otherNodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  return { productNodes, otherNodes };
}

function countCheckedReworkTargetNodes(productNodes, otherNodes) {
  return (productNodes || []).filter((n) => n.checked).length
    + (otherNodes || []).filter((n) => n.checked).length;
}

function collectCheckedReworkTargetNodeIds(productNodes, otherNodes) {
  return [...(productNodes || []), ...(otherNodes || [])]
    .filter((n) => n.checked)
    .map((n) => n.id);
}

function toggleReworkTargetNode(productNodes, otherNodes, nodeId) {
  const toggle = (list) => (list || []).map((node) => (
    node.id === nodeId ? { ...node, checked: !node.checked } : node
  ));
  return {
    productNodes: toggle(productNodes),
    otherNodes: toggle(otherNodes),
  };
}

module.exports = {
  buildReworkTargetNodeOptions,
  countCheckedReworkTargetNodes,
  collectCheckedReworkTargetNodeIds,
  toggleReworkTargetNode,
};
