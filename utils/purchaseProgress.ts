/**
 * 采购订单进度纯函数（计划单详情 / 列表共用口径）。
 *
 * 口径：进度 = 已收 / 已订购（与详情面板单物料 `getInboundProgress` 一致）。
 * - 未下任何采购订单（ordered <= 0）时进度为 null（列表上不展示）。
 * - 超收（received > ordered）时百分比截断为 1，由 `isOverReceived` 单独标记。
 */
export interface PurchaseProgressInput {
  received: number;
  ordered: number;
}

/** 已订购为 0 时返回 null（无采购订单，列表留空）；否则返回 [0,1] 的完成率 */
export function computePurchaseProgressPct(input: PurchaseProgressInput): number | null {
  const ordered = Number(input?.ordered ?? 0);
  const received = Number(input?.received ?? 0);
  if (!(ordered > 0)) return null;
  return Math.min(1, received / ordered);
}

/** 是否超收（已收 > 已订购，且确有订购量） */
export function isOverReceived(input: PurchaseProgressInput): boolean {
  const ordered = Number(input?.ordered ?? 0);
  const received = Number(input?.received ?? 0);
  return ordered > 0 && received > ordered;
}
