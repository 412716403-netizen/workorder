/**
 * 外协统计聚合（与 OutsourcePanel 待收回清单口径一致）。
 */

export interface OutsourceStatsRecord {
  type: string;
  orderId?: string | null;
  productId?: string | null;
  nodeId?: string | null;
  partner?: string | null;
  quantity?: number;
  status?: string | null;
  sourceReworkId?: string | null;
  timestamp?: Date | string;
}

export interface OutsourceTemplateStats {
  taskCount: number;
  pendingQty: number;
  progress: number;
  periodDispatchedQty: number;
  periodReceivedQty: number;
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

function scopeKey(r: OutsourceStatsRecord): string | null {
  if (!r.nodeId) return null;
  const partner = r.partner ?? '';
  if (r.orderId) return `order:${r.orderId}|${partner}`;
  if (r.productId) return `product:${r.productId}|${partner}`;
  return null;
}

/** 按工序汇总外协任务、待收回与周期内外协流水 */
export function computeOutsourceStatsByTemplate(opts: {
  templateIds: string[];
  records: OutsourceStatsRecord[];
  periodStart: Date;
  periodEnd: Date;
}): Map<string, OutsourceTemplateStats> {
  const { templateIds, records, periodStart, periodEnd } = opts;
  const outsource = records.filter(r => r.type === 'OUTSOURCE' && !r.sourceReworkId);
  const result = new Map<string, OutsourceTemplateStats>();

  for (const tid of templateIds) {
    const nodeRecords = outsource.filter(r => r.nodeId === tid);
    type ScopeAgg = { dispatched: number; received: number };
    const byScope = new Map<string, ScopeAgg>();

    for (const r of nodeRecords) {
      const key = scopeKey(r);
      if (!key) continue;
      const agg = byScope.get(key) ?? { dispatched: 0, received: 0 };
      const qty = Number(r.quantity ?? 0);
      if (r.status === '加工中') agg.dispatched += qty;
      else if (r.status === '已收回') agg.received += qty;
      byScope.set(key, agg);
    }

    let taskCount = 0;
    let pendingQty = 0;
    let dispatchedTotal = 0;
    let receivedTotal = 0;
    byScope.forEach(agg => {
      const pending = Math.max(0, agg.dispatched - agg.received);
      const scopeDispatched = agg.dispatched + agg.received;
      if (pending > 0) taskCount += 1;
      pendingQty += pending;
      dispatchedTotal += scopeDispatched;
      receivedTotal += agg.received;
    });

    let periodDispatchedQty = 0;
    let periodReceivedQty = 0;
    for (const r of nodeRecords) {
      if (!recordTimestampInPeriod(r.timestamp, periodStart, periodEnd)) continue;
      const qty = Number(r.quantity ?? 0);
      if (r.status === '加工中') periodDispatchedQty += qty;
      else if (r.status === '已收回') periodReceivedQty += qty;
    }

    const progress =
      dispatchedTotal > 0
        ? Math.min(100, Math.round((receivedTotal / dispatchedTotal) * 100))
        : 0;

    result.set(tid, {
      taskCount,
      pendingQty: Math.round(pendingQty),
      progress,
      periodDispatchedQty: Math.round(periodDispatchedQty),
      periodReceivedQty: Math.round(periodReceivedQty),
    });
  }

  return result;
}
