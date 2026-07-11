import { milestoneNodeIdsEqual } from './productProcessLock.js';

export type OutsourceRouteStepLike = {
  stepOrder: number;
  nodeId?: string | null;
};

/** 按 stepOrder 排序后提取外协路线工序 nodeId 序列 */
export function outsourceRouteNodeIdsInOrder(
  steps: readonly OutsourceRouteStepLike[] | null | undefined,
): string[] {
  if (!steps?.length) return [];
  return [...steps]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map(s => (typeof s.nodeId === 'string' ? s.nodeId.trim() : ''))
    .filter(id => id.length > 0);
}

/** 外协路线工序序列须与产品标准生产路线（milestoneNodeIds）完全一致 */
export function outsourceRouteMatchesProductMilestones(
  steps: readonly OutsourceRouteStepLike[] | null | undefined,
  milestoneNodeIds: readonly string[] | null | undefined,
): boolean {
  const routeIds = outsourceRouteNodeIdsInOrder(steps);
  const productIds = (milestoneNodeIds ?? []).filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  );
  if (routeIds.length !== productIds.length) return false;
  return milestoneNodeIdsEqual(routeIds, productIds);
}

/** 外协路线须与本次涉及的全部产品标准生产路线均一致 */
export function outsourceRouteMatchesAllProductMilestones(
  steps: readonly OutsourceRouteStepLike[] | null | undefined,
  productMilestoneRoutes: readonly (readonly string[] | null | undefined)[],
): boolean {
  if (productMilestoneRoutes.length === 0) return false;
  return productMilestoneRoutes.every(milestones =>
    outsourceRouteMatchesProductMilestones(steps, milestones),
  );
}
