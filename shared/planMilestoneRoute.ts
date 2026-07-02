import { milestoneNodeIdsEqual } from './productProcessLock';

type PlanLike = { milestoneNodeIds?: readonly string[] | null } | null | undefined;
type ProductLike = { milestoneNodeIds?: readonly string[] | null } | null | undefined;

/** 计划有效工序路线：计划覆盖非空时用计划，否则用产品标准路线 */
export function getEffectivePlanMilestoneNodeIds(
  plan: PlanLike,
  product: ProductLike,
): string[] {
  const planIds = plan?.milestoneNodeIds;
  if (Array.isArray(planIds) && planIds.length > 0) {
    return [...planIds];
  }
  const productIds = product?.milestoneNodeIds;
  if (Array.isArray(productIds) && productIds.length > 0) {
    return [...productIds];
  }
  return [];
}

/** 保存时：与产品路线相同则清除覆盖（存 null），否则存计划专属路线 */
export function normalizePlanMilestoneNodeIdsForSave(
  edited: readonly string[],
  productIds: readonly string[],
): string[] | null {
  if (edited.length === 0) {
    return null;
  }
  if (milestoneNodeIdsEqual(edited, productIds)) {
    return null;
  }
  return [...edited];
}

export function parseMilestoneNodeIdsJson(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return ids.length > 0 ? ids : null;
}
