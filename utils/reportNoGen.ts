/**
 * 报工单号生成 (Phase 3.8 抽离自 views/order-list/ReportModal.tsx)。
 *
 * 规则：BG + 当日 yyyymmdd + - + 4 位流水。流水按"当日已存在的不同报工批次数 + 1"。
 * - 一个 reportBatchId 计 1 次（同批次的多条记录算同号）
 * - 没有 reportBatchId 时退化为 reportNo / id 做去重
 */
import type { ProductionOrder, ProductMilestoneProgress } from '../types';
import { toLocalCompactYmd } from './localDateTime';

interface ReportLike {
  id: string;
  timestamp?: string | Date | number | null;
  reportBatchId?: string | null;
  reportNo?: string | null;
}

/** 计算当日下一个报工批次号：BGyyyymmdd-NNNN */
export function generateNextReportNo(
  orders: ReadonlyArray<Pick<ProductionOrder, 'milestones'>>,
  productMilestoneProgresses: ReadonlyArray<Pick<ProductMilestoneProgress, 'reports'>>,
  now: Date = new Date(),
): string {
  const todayStr = toLocalCompactYmd(now);
  const keys = new Set<string>();

  const visit = (r: ReportLike | null | undefined): void => {
    if (!r) return;
    const ds = toLocalCompactYmd(r.timestamp as Date);
    if (!ds || ds !== todayStr) return;
    const key = r.reportBatchId || r.reportNo || r.id;
    if (key) keys.add(key);
  };

  orders.forEach(o => {
    o.milestones?.forEach(m => {
      ((m as { reports?: ReportLike[] }).reports || []).forEach(visit);
    });
  });
  productMilestoneProgresses.forEach(p => {
    ((p as { reports?: ReportLike[] }).reports || []).forEach(visit);
  });

  const seq = keys.size + 1;
  const seqStr = String(seq).padStart(4, '0');
  return `BG${todayStr}-${seqStr}`;
}
