import type { PlanOrder } from '../types';

/**
 * 单号 PLN / PLN- 后的主数字（与 getNextPlanNumber 一致），用于时间戳相同时排序。
 * 字典序会把 PLN11 排在 PLN2 前面，故必须用数值比较。
 */
export function planNumberSeqForSort(planNumber: string): number {
  const m = (planNumber || '').trim().match(/^PLN-?(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * 列表排序用时刻：优先 createdAt，其次 updatedAt（仅日期 createdAt 同一天多条时常需区分），再解析 id
 */
export function planOrderListSortMs(p: PlanOrder): number {
  if (p.createdAt) {
    const t = new Date(p.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (p.updatedAt) {
    const t = new Date(p.updatedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const m = p.id.match(/^plan-([^-]+)-/);
  if (m) {
    const ts = parseInt(m[1], 36);
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

/** 生产计划列表：严格按计划单编号降序（即生成先后），编号大的排最前 */
export function comparePlansNewestFirst(a: PlanOrder, b: PlanOrder): number {
  const n = planNumberSeqForSort(b.planNumber) - planNumberSeqForSort(a.planNumber);
  if (n !== 0) return n;
  const d = planOrderListSortMs(b) - planOrderListSortMs(a);
  if (d !== 0) return d;
  return a.id.localeCompare(b.id);
}
