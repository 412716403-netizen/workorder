/** 对齐 utils/nodeAssignmentFlags.ts */

function isWorkerAssignmentEnabled(node) {
  if (!node) return false;
  if (node.enableWorkerAssignment === false) return false;
  if (node.enableWorkerAssignment === true) return true;
  return node.enableAssignment !== false;
}

function isEquipmentAssignmentEnabled(node) {
  if (!node) return false;
  if (node.enableEquipmentAssignment === false) return false;
  if (node.enableEquipmentAssignment === true) return true;
  return node.enableAssignment !== false;
}

module.exports = {
  isWorkerAssignmentEnabled,
  isEquipmentAssignmentEnabled,
};
