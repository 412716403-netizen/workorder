/**
 * 外协"待收回 / 收货录入"链路统一的 key 形态。
 *
 * 待收回行（`outsourceReceiveRows`）按发出单原 `orderId` 决定维度：
 * - 工单级（`orderId` 非空）：聚合 + 行 baseKey = `orderId|nodeId|partner`
 * - 产品级（`orderId` 空）：聚合 + 行 baseKey = `productId|nodeId|partner`
 *
 * 历史 bug：工单级 key 不包含 partner，导致同一工单同一工序发给多个加工厂时
 * 被合并为一行（数量相加、partner 只取第一条），「待收回清单」无法正确分户。
 *
 * 变体 key（用于 `receiveFormQuantities` 录入）：
 * - 工单级：`${baseKey}|${variantId}` —— 即 `orderId|nodeId|partner|variantId`
 * - 产品级：`${baseKey}${RECEIVE_VARIANT_SEP}${variantId}` —— 即 `productId|nodeId|partner__v__variantId`
 *
 * 两个 scope 的 baseKey 都是 3 段（`|`-separated）；`resolveOutsourceReceiveEntry`
 * 通过先按产品级 baseKey 反查行命中，否则回落到工单级解析来消歧。
 */

export const RECEIVE_VARIANT_SEP = '__v__';

export interface OutsourceReceiveRowLike {
  orderId?: string;
  productId: string;
  nodeId: string;
  partner: string;
}

/**
 * 聚合或定位一行待收回记录时使用的 baseKey。
 * 两种 scope 都包含 partner，确保多加工厂分户。
 */
export function outsourceReceiveBaseKey(row: OutsourceReceiveRowLike): string {
  const partner = row.partner ?? '';
  if (row.orderId != null) return `${row.orderId}|${row.nodeId}|${partner}`;
  return `${row.productId}|${row.nodeId}|${partner}`;
}

/** 工单级行：用于 `outsourceReceiveRows` 的内部 byKey 聚合。 */
export function outsourceReceiveOrderAggKey(orderId: string, nodeId: string, partner: string): string {
  return `O|${orderId}|${nodeId}|${partner ?? ''}`;
}

/** 产品级行：用于 `outsourceReceiveRows` 的内部 byKey 聚合。 */
export function outsourceReceiveProductAggKey(productId: string, nodeId: string, partner: string): string {
  return `P|${productId}|${nodeId}|${partner ?? ''}`;
}

/**
 * 解析 `receiveFormQuantities` 的 entry key。
 * 与 `productionLinkMode` 无关，仅按 row 自身 `orderId` 决定 scope（方案 A）。
 *
 * @param key   录入 entry key
 * @param rows  当前 `outsourceReceiveRows`
 */
export function resolveOutsourceReceiveEntry(
  key: string,
  rows: OutsourceReceiveRowLike[],
):
  | { row: OutsourceReceiveRowLike; isProductScope: boolean; baseKey: string; variantId?: string }
  | null {
  if (key.includes(RECEIVE_VARIANT_SEP)) {
    const [baseK, variantId] = key.split(RECEIVE_VARIANT_SEP);
    if (!baseK) return null;
    const row = rows.find(r => r.orderId == null && outsourceReceiveBaseKey(r) === baseK);
    if (row) return { row, isProductScope: true, baseKey: baseK, variantId };
    return null;
  }
  const productRow = rows.find(r => r.orderId == null && outsourceReceiveBaseKey(r) === key);
  if (productRow) return { row: productRow, isProductScope: true, baseKey: key };
  const parts = key.split('|');
  if (parts.length < 3) return null;
  const orderId = parts[0]!;
  const nodeId = parts[1]!;
  const partner = parts[2]!;
  const variantId = parts.length > 3 ? parts.slice(3).join('|') : undefined;
  const baseKey = `${orderId}|${nodeId}|${partner}`;
  const orderRow = rows.find(
    r => r.orderId === orderId && r.nodeId === nodeId && (r.partner ?? '') === partner,
  );
  if (orderRow) return { row: orderRow, isProductScope: false, baseKey, variantId };
  return null;
}
