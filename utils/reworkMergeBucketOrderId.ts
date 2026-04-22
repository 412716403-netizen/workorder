import type { ProductionOrder } from '../types';

/**
 * 与 buildDefectiveReworkByOrderMilestone 中返工完成量 map 键一致：
 * REWORK_REPORT 按「一级父工单 id | 来源工序」归并，子工单读 rework 应落到父单桶。
 */
export function reworkMergeBucketOrderId(
  orderId: string,
  orders: Pick<ProductionOrder, 'id' | 'parentOrderId'>[] | undefined,
): string {
  if (!orders?.length) return orderId;
  const o = orders.find(x => x.id === orderId);
  return o?.parentOrderId ?? orderId;
}

/** 返工单据 orderId 可能为子单或历史链上 id：沿 parent 上溯，判断是否仍属于该产品下的工单树 */
export function orderBelongsToProductInList(
  orderId: string | undefined,
  productId: string,
  orders: Pick<ProductionOrder, 'id' | 'parentOrderId' | 'productId'>[],
): boolean {
  if (!orderId) return true;
  const byId = new Map(orders.map(o => [o.id, o]));
  let cur = byId.get(orderId);
  let g = 0;
  while (cur && g++ < 40) {
    if (cur.productId === productId) return true;
    if (!cur.parentOrderId) return false;
    cur = byId.get(cur.parentOrderId);
  }
  return false;
}
