/**
 * 进销存采购/销售订单列表「列表显示」配置用到的纯判断（与 PSIOpsView 列表行聚合一致）。
 */

export function purchaseOrderDocHasUnsettled(
  docNumber: string,
  docItems: Array<{ id: string; quantity?: number | null }>,
  receivedByOrderLine: Record<string, number>,
): boolean {
  return docItems.some(
    item => (Number(item.quantity) || 0) > (receivedByOrderLine[`${docNumber}::${item.id}`] ?? 0),
  );
}

export function salesOrderDocHasNotFullyShippedLine(
  docItems: Array<{ id: string; lineGroupId?: string; quantity?: number | null; shippedQuantity?: number | null }>,
): boolean {
  const groups: Record<string, typeof docItems> = {};
  for (const item of docItems) {
    const gid = item.lineGroupId ?? item.id;
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(item);
  }
  for (const grp of Object.values(groups)) {
    const orderQty = grp.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const shippedQty = grp.reduce((s, i) => s + (Number(i.shippedQuantity) || 0), 0);
    if (shippedQty < orderQty) return true;
  }
  return false;
}

/** 销售订单单据级：全部行组已发数量 ≥ 订货数量 */
export function salesOrderDocFullyShipped(
  docItems: Array<{ id: string; lineGroupId?: string; quantity?: number | null; shippedQuantity?: number | null }>,
): boolean {
  if (docItems.length === 0) return false;
  return !salesOrderDocHasNotFullyShippedLine(docItems);
}
