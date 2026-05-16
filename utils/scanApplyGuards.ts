/**
 * 扫码累加前的纯函数判断：是否超出单据/格子允许的最大数量。
 *
 * 与 [`addScanQtyToStockInForm`](./pendingStockScanMatch.ts) 的拒绝式校验、
 * 与后端 [`POST /item-codes/scan/validate-usage`](../backend/src/services/scanValidate.service.ts)
 * 的 EXCEEDS_MAX 判定保持一致：`current + add > max` 即拒绝。
 */

export interface ExceedMaxCheck {
  exceeds: boolean;
  /** 仍可继续累加的剩余数量（非负） */
  remaining: number;
  message: string | null;
}

/**
 * 判断「累加后是否超过 max」。`max` 为 null/undefined/Infinity 时视为不限制。
 */
export function checkExceedMax(
  current: number,
  add: number,
  max: number | null | undefined,
): ExceedMaxCheck {
  const cur = Math.max(0, Number(current) || 0);
  const inc = Math.max(0, Number(add) || 0);
  if (max == null || !Number.isFinite(max)) {
    return { exceeds: false, remaining: Number.POSITIVE_INFINITY, message: null };
  }
  const cap = Math.max(0, Number(max));
  if (cur + inc <= cap) {
    return { exceeds: false, remaining: cap - cur, message: null };
  }
  const remaining = Math.max(0, cap - cur);
  return {
    exceeds: true,
    remaining,
    message: formatExceedMaxMessage(cur, inc, cap, remaining),
  };
}

/** 仅给出 boolean，便于调用方 `if (wouldExceedMax(...)) return;` */
export function wouldExceedMax(
  current: number,
  add: number,
  max: number | null | undefined,
): boolean {
  return checkExceedMax(current, add, max).exceeds;
}

/**
 * 标准化的超限提示文案（与 scanValidate.service 后端 EXCEEDS_MAX 文案一致）。
 */
export function formatExceedMaxMessage(
  current: number,
  add: number,
  max: number,
  remaining: number,
): string {
  return `本次扫入 ${add} 件 + 已填 ${current} 件 已超过最大可填 ${max} 件，仅可再加 ${remaining} 件`;
}
