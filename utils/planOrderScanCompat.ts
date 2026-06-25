import type { PlanOrder } from '../types';

function buildParentMap(plans: PlanOrder[]): Map<string, string | undefined> {
  const m = new Map<string, string | undefined>();
  for (const p of plans) m.set(p.id, p.parentPlanId);
  return m;
}

function getRootPlanId(planId: string, parentById: Map<string, string | undefined>): string {
  const guard = new Set<string>();
  let cur = planId;
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    const parent = parentById.get(cur);
    if (!parent) return cur;
    cur = parent;
  }
  return planId;
}

function isAncestorOf(
  ancestorId: string,
  nodeId: string,
  parentById: Map<string, string | undefined>,
): boolean {
  const guard = new Set<string>();
  let cur: string | undefined = nodeId;
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    if (cur === ancestorId) return true;
    cur = parentById.get(cur);
  }
  return false;
}

/**
 * 报工扫码：码所属计划与工单计划是否在同一计划树内（含父子计划）。
 * 同一转单链路下，批次可能在父计划、工单挂在子计划（或相反）。
 */
export function arePlanOrdersScanCompatible(
  plans: PlanOrder[],
  codePlanOrderId: string,
  workOrderPlanOrderId: string,
): boolean {
  if (!codePlanOrderId || !workOrderPlanOrderId) return false;
  if (codePlanOrderId === workOrderPlanOrderId) return true;
  if (plans.length === 0) return false;

  const parentById = buildParentMap(plans);
  const rootA = getRootPlanId(codePlanOrderId, parentById);
  const rootB = getRootPlanId(workOrderPlanOrderId, parentById);
  if (rootA !== rootB) return false;

  return (
    isAncestorOf(codePlanOrderId, workOrderPlanOrderId, parentById) ||
    isAncestorOf(workOrderPlanOrderId, codePlanOrderId, parentById)
  );
}

/** 两计划是否在同一棵计划树的根节点下（含兄弟子计划，不要求父子关系）。 */
export function arePlanOrdersInSamePlanTreeRoot(
  plans: PlanOrder[],
  codePlanOrderId: string,
  workOrderPlanOrderId: string,
): boolean {
  if (!codePlanOrderId || !workOrderPlanOrderId) return false;
  if (codePlanOrderId === workOrderPlanOrderId) return true;
  if (plans.length === 0) return false;
  const parentById = buildParentMap(plans);
  return getRootPlanId(codePlanOrderId, parentById) === getRootPlanId(workOrderPlanOrderId, parentById);
}

/**
 * 工序报工扫码：计划归属校验。
 * - 关联工单模式：码计划须与入口工单计划在父子链上兼容。
 * - 关联产品模式：码计划须与该产品任一工单的 planOrderId 兼容，或与其处于同一计划树根（兄弟子计划）。
 */
export function isReportScanPlanCompatible(
  plans: PlanOrder[],
  codePlanOrderId: string,
  opts: {
    productionLinkMode: 'order' | 'product';
    anchorPlanOrderId?: string | null;
    productPlanOrderIds: string[];
  },
): boolean {
  if (!codePlanOrderId) return false;
  const { productionLinkMode, anchorPlanOrderId, productPlanOrderIds } = opts;

  if (productionLinkMode === 'product') {
    const planIds = [...new Set(productPlanOrderIds.filter(Boolean))];
    if (planIds.length === 0) return true;
    if (planIds.includes(codePlanOrderId)) return true;
    return planIds.some(
      (id) =>
        arePlanOrdersScanCompatible(plans, codePlanOrderId, id) ||
        arePlanOrdersInSamePlanTreeRoot(plans, codePlanOrderId, id),
    );
  }

  if (!anchorPlanOrderId) return false;
  return arePlanOrdersScanCompatible(plans, codePlanOrderId, anchorPlanOrderId);
}
