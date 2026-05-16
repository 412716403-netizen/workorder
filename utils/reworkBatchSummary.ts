/**
 * 返工/外协报工批次汇总相关纯函数 (Phase 3.9 抽离自 ReworkReportFlowDetailModal.tsx)。
 *
 * 弹窗头部摘要里大量这种 "detailBatch 上做累加/去重/选唯一值" 的纯计算，
 * 抽出后可独立单测，避免视图层混着 React 渲染逻辑。
 */

interface RecordLike {
  quantity?: number | null;
  amount?: number | null;
  unitPrice?: number | null;
  partner?: string | null;
  operator?: string | null;
}

/** 累加 batch 内所有记录的 quantity，null/undefined 视为 0 */
export function sumBatchTotalQty(batch: ReadonlyArray<Pick<RecordLike, 'quantity'>>): number {
  return batch.reduce((s, x) => s + (x.quantity ?? 0), 0);
}

/**
 * 累加 batch 内"金额"：
 *  - 优先使用 amount（amount > 0 时直接计）
 *  - 否则用 unitPrice * quantity（仅当 unitPrice > 0）
 *  - 都没有时该行贡献 0
 */
export function sumBatchTotalAmount(batch: ReadonlyArray<RecordLike>): number {
  return batch.reduce((s, x) => {
    if (x.amount != null && x.amount > 0) return s + x.amount;
    const up = x.unitPrice ?? 0;
    const q = x.quantity ?? 0;
    return up > 0 ? s + q * up : s;
  }, 0);
}

/**
 * 求 batch 内"唯一单价" label：
 *  - 没有 unitPrice > 0 的记录 → null
 *  - 所有正单价都相同 → 该单价
 *  - 多种单价混合 → null（详情头部应显示 — 而非任一）
 */
export function pickUniqueUnitPrice(batch: ReadonlyArray<Pick<RecordLike, 'unitPrice'>>): number | null {
  const prices = batch.map(x => x.unitPrice).filter((p): p is number => p != null && p > 0);
  if (prices.length === 0) return null;
  return prices.every(p => p === prices[0]) ? prices[0]! : null;
}

/** 提取 batch 内出现的外协合作单位 (partner)，trim + 去空 + 去重，按首次出现顺序 */
export function uniqOutsourcePartnersInBatch(batch: ReadonlyArray<Pick<RecordLike, 'partner'>>): string[] {
  return [...new Set(batch.map(x => (x.partner ?? '').trim()).filter(Boolean))];
}

/** 提取 batch 内出现的操作工，trim + 去空 + 去重 */
export function uniqOperatorsInBatch(batch: ReadonlyArray<Pick<RecordLike, 'operator'>>): string[] {
  return [...new Set(batch.map(x => (x.operator ?? '').trim()).filter(Boolean))];
}
