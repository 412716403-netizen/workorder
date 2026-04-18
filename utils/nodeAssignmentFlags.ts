import type { GlobalNodeTemplate } from '../types';

/**
 * 是否启用「工人派工」：以 enableWorkerAssignment 为准；未设置时回退到已废弃的 enableAssignment。
 * 企业关闭「设备派工与报工选设备」模块时，界面应结合 `useEquipmentFeaturesEffective()` 再决定是否展示。
 */
export function isWorkerAssignmentEnabled(node: GlobalNodeTemplate): boolean {
  if (node.enableWorkerAssignment === false) return false;
  if (node.enableWorkerAssignment === true) return true;
  return node.enableAssignment !== false;
}

/**
 * 是否启用「设备派工」：以 enableEquipmentAssignment 为准；未设置时回退到已废弃的 enableAssignment。
 */
export function isEquipmentAssignmentEnabled(node: GlobalNodeTemplate): boolean {
  if (node.enableEquipmentAssignment === false) return false;
  if (node.enableEquipmentAssignment === true) return true;
  return node.enableAssignment !== false;
}
