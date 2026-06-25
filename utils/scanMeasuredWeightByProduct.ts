import type { ScanBatchApplyMeta } from '../components/scan/ScanBatchSessionModal';
import type { ScanPayload } from './scanPayload';
import { roundWeightKg } from './reportBatchWeightHelpers';

/**
 * 批量扫码确认：按 productId 累加各行实测重量（与 payloads 同序的 meta.rowMeasuredWeightKg）。
 * 外协收货、报工、返工等多产品场景共用。
 */
export async function accumulateMeasuredWeightByProduct(
  payloads: ScanPayload[],
  meta: ScanBatchApplyMeta | undefined,
  resolveProductId: (payload: ScanPayload) => Promise<string | null>,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!meta?.rowMeasuredWeightKg?.length) return result;
  for (let i = 0; i < payloads.length; i++) {
    const w = meta.rowMeasuredWeightKg[i];
    if (w == null || !(w > 0)) continue;
    const productId = await resolveProductId(payloads[i]!);
    if (!productId) continue;
    result.set(productId, roundWeightKg((result.get(productId) ?? 0) + w));
  }
  return result;
}

/** 将按产品累加的扫码重量合并进现有 weight 快照（累加，非覆盖）。 */
export function mergeWeightByProduct(
  prev: Record<string, number>,
  additions: Map<string, number>,
): Record<string, number> {
  if (additions.size === 0) return prev;
  const next = { ...prev };
  for (const [productId, w] of additions) {
    next[productId] = roundWeightKg((next[productId] ?? 0) + w);
  }
  return next;
}
