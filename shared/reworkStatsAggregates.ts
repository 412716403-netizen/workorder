/**
 * 返工统计聚合（与 ReworkPanel 返工管理口径一致）。
 */

import type { ProcessSequenceMode, ProductionLinkMode } from './types.js';
import { orderBelongsToProductInList } from './orderReportableAggregates.js';

export interface ReworkStatsRecord {
  type: string;
  orderId?: string | null;
  productId?: string | null;
  nodeId?: string | null;
  sourceNodeId?: string | null;
  quantity?: number;
  status?: string | null;
  reworkNodeIds?: string[] | null;
  completedNodeIds?: string[] | null;
  reworkCompletedQuantityByNode?: Record<string, number> | null;
  timestamp?: Date | string;
}

export interface ReworkStatsOrderRef {
  id: string;
  productId: string;
  parentOrderId?: string | null;
}

export interface ReworkTemplateStats {
  taskCount: number;
  pendingQty: number;
  progress: number;
  periodCompletedQty: number;
  periodNewReworkQty: number;
}

function recordTimestampInPeriod(
  ts: Date | string | undefined,
  start: Date,
  end: Date,
): boolean {
  if (!ts) return false;
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}

export function reworkRemainingAtNodeRecord(
  r: ReworkStatsRecord,
  nodeId: string,
  processSequenceMode: ProcessSequenceMode,
): number {
  const pathNodes =
    r.reworkNodeIds && r.reworkNodeIds.length > 0
      ? r.reworkNodeIds
      : r.nodeId
        ? [r.nodeId]
        : [];
  const idx = pathNodes.indexOf(nodeId);
  if (idx < 0) return 0;
  const qty = Number(r.quantity ?? 0);
  const doneAtNode =
    r.reworkCompletedQuantityByNode?.[nodeId]
    ?? ((r.completedNodeIds ?? []).includes(nodeId) ? qty : 0);
  if (processSequenceMode === 'sequential' && idx > 0) {
    const prevNodeId = pathNodes[idx - 1];
    const doneAtPrev = r.reworkCompletedQuantityByNode?.[prevNodeId] ?? 0;
    return Math.max(0, Math.min(doneAtPrev, qty) - doneAtNode);
  }
  return Math.max(0, qty - doneAtNode);
}

function targetNodesOf(r: ReworkStatsRecord): string[] {
  if (r.reworkNodeIds && r.reworkNodeIds.length > 0) return r.reworkNodeIds;
  return r.nodeId ? [r.nodeId] : [];
}

function scopeKey(
  r: ReworkStatsRecord,
  productionLinkMode: ProductionLinkMode,
): string | null {
  if (productionLinkMode === 'product') {
    return r.productId ? `product:${r.productId}` : null;
  }
  return r.orderId ? `order:${r.orderId}` : null;
}

function isReworkCompleted(r: ReworkStatsRecord, targetNodes: string[]): boolean {
  if (r.status === '已完成') return true;
  const qty = Number(r.quantity ?? 0);
  return (
    targetNodes.length > 0
    && targetNodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) >= qty)
  );
}

/** 按工序汇总返工任务、待返工与周期内完成/新开 */
export function computeReworkStatsByTemplate(opts: {
  templateIds: string[];
  records: ReworkStatsRecord[];
  orders: ReworkStatsOrderRef[];
  processSequenceMode: ProcessSequenceMode;
  productionLinkMode: ProductionLinkMode;
  periodStart: Date;
  periodEnd: Date;
}): Map<string, ReworkTemplateStats> {
  const {
    templateIds,
    records,
    orders,
    processSequenceMode,
    productionLinkMode,
    periodStart,
    periodEnd,
  } = opts;

  const reworkRecords = records.filter(r => r.type === 'REWORK');
  const reportRecords = records.filter(r => r.type === 'REWORK_REPORT');
  const result = new Map<string, ReworkTemplateStats>();

  for (const tid of templateIds) {
    type ScopeAgg = { totalQty: number; completedQty: number; pendingQty: number };
    const byScope = new Map<string, ScopeAgg>();

    for (const r of reworkRecords) {
      if (productionLinkMode === 'product') {
        const pid = r.productId;
        if (!pid) continue;
        if (r.orderId && !orderBelongsToProductInList(r.orderId, pid, orders)) continue;
      } else if (!r.orderId) {
        continue;
      }

      const targets = targetNodesOf(r);
      if (!targets.includes(tid)) continue;

      const key = scopeKey(r, productionLinkMode);
      if (!key) continue;

      const completed = isReworkCompleted(r, targets);
      const agg = byScope.get(key) ?? { totalQty: 0, completedQty: 0, pendingQty: 0 };
      const qty = Number(r.quantity ?? 0);
      agg.totalQty += qty;
      const doneAtNode =
        r.reworkCompletedQuantityByNode?.[tid]
        ?? ((r.completedNodeIds ?? []).includes(tid) || completed ? qty : 0);
      agg.completedQty += Math.min(qty, doneAtNode);
      agg.pendingQty += reworkRemainingAtNodeRecord(r, tid, processSequenceMode);
      byScope.set(key, agg);
    }

    let taskCount = 0;
    let pendingQty = 0;
    let totalQty = 0;
    let completedQty = 0;
    byScope.forEach(agg => {
      if (agg.pendingQty > 0) taskCount += 1;
      pendingQty += agg.pendingQty;
      totalQty += agg.totalQty;
      completedQty += agg.completedQty;
    });

    let periodCompletedQty = 0;
    for (const r of reportRecords) {
      if (r.nodeId !== tid) continue;
      if (!recordTimestampInPeriod(r.timestamp, periodStart, periodEnd)) continue;
      periodCompletedQty += Number(r.quantity ?? 0);
    }

    let periodNewReworkQty = 0;
    for (const r of reworkRecords) {
      if (!targetNodesOf(r).includes(tid)) continue;
      if (!recordTimestampInPeriod(r.timestamp, periodStart, periodEnd)) continue;
      if (productionLinkMode === 'product') {
        const pid = r.productId;
        if (!pid) continue;
        if (r.orderId && !orderBelongsToProductInList(r.orderId, pid, orders)) continue;
      } else if (!r.orderId) {
        continue;
      }
      periodNewReworkQty += Number(r.quantity ?? 0);
    }

    const progress =
      totalQty > 0 ? Math.min(100, Math.round((completedQty / totalQty) * 100)) : 0;

    result.set(tid, {
      taskCount,
      pendingQty: Math.round(pendingQty),
      progress,
      periodCompletedQty: Math.round(periodCompletedQty),
      periodNewReworkQty: Math.round(periodNewReworkQty),
    });
  }

  return result;
}
