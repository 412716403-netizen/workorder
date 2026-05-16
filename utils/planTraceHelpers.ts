/**
 * PlanTraceSection 用到的纯函数 (Phase 3.9 抽离)。
 *
 * - inferTraceGenModeFromExisting：打开计划追溯详情时根据"已有单品码 / 批次码"猜默认 tab
 * - collectSubtreePlanIdsForPlan：以某根计划为起点 BFS 收集所有子孙计划 id（含自身）
 */
import type { PlanOrder } from '../types';

export type TraceGenMode = 'batch' | 'batchWithItems';

/**
 * 根据计划当前已有的单品码/批次码总数推断打开详情时应高亮的"生成类型"。
 * - 都为 0 → null（用户首次进，由前端选默认）
 * - 有 virtualBatch 也有 itemCode → batchWithItems
 * - 仅 virtualBatch → batch
 * - 仅 itemCode → batchWithItems（旧逻辑：itemCode 也归到 batchWithItems）
 */
export function inferTraceGenModeFromExisting(args: {
  itemCodesTotal: number;
  virtualBatchesTotal: number;
}): TraceGenMode | null {
  const { itemCodesTotal, virtualBatchesTotal } = args;
  if (itemCodesTotal <= 0 && virtualBatchesTotal <= 0) return null;
  if (virtualBatchesTotal > 0 && itemCodesTotal > 0) return 'batchWithItems';
  if (virtualBatchesTotal > 0) return 'batch';
  if (itemCodesTotal > 0) return 'batchWithItems';
  return null;
}

/**
 * 以 rootId 为起点 BFS 收集所有子孙计划 id（含自身），顺序为"按层级从浅到深"。
 * 用于子计划展开 / 单品码批量打印 / 追溯过滤。
 */
export function collectSubtreePlanIdsForPlan(
  rootId: string,
  allPlans: ReadonlyArray<Pick<PlanOrder, 'id' | 'parentPlanId'>>,
): string[] {
  const childrenMap = new Map<string, Array<{ id: string }>>();
  for (const p of allPlans) {
    if (!p.parentPlanId) continue;
    if (!childrenMap.has(p.parentPlanId)) childrenMap.set(p.parentPlanId, []);
    childrenMap.get(p.parentPlanId)!.push({ id: p.id });
  }
  const out: string[] = [];
  let frontier: string[] = [rootId];
  while (frontier.length > 0) {
    out.push(...frontier);
    const next: string[] = [];
    for (const id of frontier) {
      const ch = childrenMap.get(id);
      if (ch) next.push(...ch.map(c => c.id));
    }
    frontier = next;
  }
  return out;
}
