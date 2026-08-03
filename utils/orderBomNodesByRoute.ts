import type { GlobalNodeTemplate } from '../types';

/**
 * BOM 工序严格跟随商品/款式基本信息中的有序生产路线。
 * 路线中已失效的节点忽略；未启用 BOM 的节点不进入 BOM 矩阵。
 */
export function orderBomNodesByRoute(
  milestoneNodeIds: string[],
  globalNodes: GlobalNodeTemplate[],
): GlobalNodeTemplate[] {
  const nodeById = new Map(globalNodes.map((node) => [node.id, node]));
  return milestoneNodeIds
    .map((id) => nodeById.get(id))
    .filter((node): node is GlobalNodeTemplate => Boolean(node?.hasBOM));
}
