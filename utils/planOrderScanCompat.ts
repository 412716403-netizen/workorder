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
