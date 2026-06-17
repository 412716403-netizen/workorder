import type { ProductionLinkMode } from './types';

/** 待配工序工单：产品尚未绑定工序路线，允许首次配置 milestoneNodeIds */
export const PROCESS_LOCK_ORDER_STATUS_EXEMPT = 'PENDING_PROCESS';

export function milestoneNodeIdsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

export function productHasLockableProductionOrders(
  orders: ReadonlyArray<{ productId: string; status: string }>,
  productId: string,
): boolean {
  return orders.some(
    o => o.productId === productId && o.status !== PROCESS_LOCK_ORDER_STATUS_EXEMPT,
  );
}

/**
 * 产品模式下：产品已有工序路线且存在非待配工序工单时，工序（milestoneNodeIds）不可再改。
 * `processLocked` 为 API 返回的运行时标志；缺省时用 orders 本地推算。
 */
export function isProductProcessLocked(
  productionLinkMode: ProductionLinkMode,
  product: {
    id: string;
    milestoneNodeIds?: readonly string[];
    processLocked?: boolean;
  },
  orders: ReadonlyArray<{ productId: string; status: string }>,
): boolean {
  if (product.processLocked === true) return true;
  if (productionLinkMode !== 'product') return false;
  const nodeIds = product.milestoneNodeIds ?? [];
  if (nodeIds.length === 0) return false;
  return productHasLockableProductionOrders(orders, product.id);
}
