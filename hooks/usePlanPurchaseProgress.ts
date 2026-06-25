import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { psi } from '../services/api/psi';
import { useAuth } from '../contexts/AuthContext';
import type { PlanOrder } from '../types';
import { computePurchaseProgressPct, isOverReceived } from '../utils/purchaseProgress';

export interface PlanPurchaseProgress {
  received: number;
  ordered: number;
  /** 完成率 [0,1]；无关联采购订单（ordered<=0）时为 null（列表不展示） */
  pct: number | null;
  overReceived: boolean;
}

/** 取计划自身 + 所有祖先计划单号（与 PlanDetailPanel 的 planNumbersForPO 同口径） */
function planNumbersWithAncestors(plan: PlanOrder, byId: Map<string, PlanOrder>): string[] {
  const nums: string[] = [plan.planNumber];
  let current: PlanOrder | undefined = plan;
  const seen = new Set<string>([plan.id]);
  while (current?.parentPlanId) {
    const parent = byId.get(current.parentPlanId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    nums.push(parent.planNumber);
    current = parent;
  }
  return nums;
}

/**
 * 计划单列表「采购订单进度」批量汇总 hook。
 *
 * - `visiblePlans`：当前页计划（仅为这些计划请求进度）。
 * - `allPlans`：全量计划，用于回溯祖先计划单号（子计划口径与详情面板一致）。
 * - `enabled`：开关 listDisplay.showPurchaseProgress 是否开启；关闭时不发请求。
 */
export function usePlanPurchaseProgress(
  visiblePlans: PlanOrder[],
  allPlans: PlanOrder[],
  enabled: boolean,
): Map<string, PlanPurchaseProgress> {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;

  const byId = useMemo(() => new Map(allPlans.map(p => [p.id, p])), [allPlans]);

  const requestPlans = useMemo(
    () =>
      visiblePlans
        .filter(p => p?.id)
        .map(p => ({ planId: p.id, planNumbers: planNumbersWithAncestors(p, byId) })),
    [visiblePlans, byId],
  );

  const planIdsKey = useMemo(
    () => requestPlans.map(p => p.planId).sort().join(','),
    [requestPlans],
  );

  const query = useQuery({
    queryKey: ['plan.purchaseProgress', tenantId, planIdsKey],
    queryFn: () => psi.plansPurchaseProgress(requestPlans),
    enabled: enabled && !!tenantId && requestPlans.length > 0,
    staleTime: 15_000,
  });

  return useMemo(() => {
    const map = new Map<string, PlanPurchaseProgress>();
    if (!query.isSuccess || !Array.isArray(query.data)) return map;
    for (const row of query.data) {
      const received = Number(row?.received ?? 0);
      const ordered = Number(row?.ordered ?? 0);
      map.set(row.planId, {
        received,
        ordered,
        pct: computePurchaseProgressPct({ received, ordered }),
        overReceived: isOverReceived({ received, ordered }),
      });
    }
    return map;
  }, [query.isSuccess, query.data]);
}
