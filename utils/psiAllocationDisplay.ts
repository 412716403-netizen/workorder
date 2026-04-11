/**
 * 销售订单配货展示用「已配」：已发 + 待发，待发 = max(0, 库内 allocatedQuantity − 已发)。
 * 已发已出库但 allocated 尚未回写时，仍把已发计入已配。
 */
export function effectiveAllocatedQuantity(allocatedQuantity: unknown, shippedQuantity: unknown): number {
  const a = Number(allocatedQuantity) || 0;
  const s = Number(shippedQuantity) || 0;
  return s + Math.max(0, a - s);
}
