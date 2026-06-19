import {
  ORDER_DISPATCH_STATUS_LABEL,
  OrderDispatchStatus,
} from '../types';

export const ORDER_DISPATCH_STATUS_CONFIRM_TITLE = '切换工单完成状态';

export function buildOrderDispatchCompletionConfirmMessage(orderNumber: string): string {
  const fromLabel = ORDER_DISPATCH_STATUS_LABEL[OrderDispatchStatus.IN_PROGRESS];
  const toLabel = ORDER_DISPATCH_STATUS_LABEL[OrderDispatchStatus.COMPLETED];
  return `工单【${orderNumber}】将从「${fromLabel}」切换为「${toLabel}」。\n切换后该工单将被标记为手动状态，后续入库（STOCK_IN）的自动推进逻辑将不再修改本工单状态。是否确认？`;
}

export function buildOrderDispatchToggleConfirmMessage(
  orderNumber: string,
  fromStatus: OrderDispatchStatus,
  toStatus: OrderDispatchStatus,
): string {
  const fromLabel = ORDER_DISPATCH_STATUS_LABEL[fromStatus];
  const toLabel = ORDER_DISPATCH_STATUS_LABEL[toStatus];
  return `工单【${orderNumber}】将从「${fromLabel}」切换为「${toLabel}」。\n切换后该工单将被标记为手动状态，后续入库（STOCK_IN）的自动推进逻辑将不再修改本工单状态。是否确认？`;
}
