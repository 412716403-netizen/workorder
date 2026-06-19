import { OrderDispatchStatus } from '../types';

/** 工单派发是否已为「已完成」（`undefined` 视为进行中，与后端默认一致）。 */
export function isOrderDispatchCompleted(order: { dispatchStatus?: OrderDispatchStatus }): boolean {
  return order.dispatchStatus === OrderDispatchStatus.COMPLETED;
}

/**
 * 「仅显示工单未完成」列表过滤：开关关闭时一律展示；开启时隐藏已完成工单。
 */
export function shouldShowOrderInIncompleteListFilter(
  order: { dispatchStatus?: OrderDispatchStatus },
  filterEnabled: boolean,
): boolean {
  if (!filterEnabled) return true;
  return !isOrderDispatchCompleted(order);
}
