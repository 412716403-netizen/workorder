import {
  OrderDispatchStatus,
  PlanDispatchStatus,
  ORDER_DISPATCH_STATUS_LABEL,
  PLAN_DISPATCH_STATUS_LABEL,
} from '../types';

/**
 * 派发完成状态徽章配色与文案（关联工单模式下计划单 / 工单中心共用）。
 * 颜色取与现有「待入库 / 已下达」等业务徽章一致的语义色：
 * - 灰：未下单
 * - 黄：进行中 / 未完成
 * - indigo（与单号标签一致）：已完成（计划单 / 工单）
 */

export interface DispatchStatusStyle {
  label: string;
  /** 圆角小徽章 Tailwind classes（含背景 / 文字 / 边框） */
  className: string;
}

/** 计划单「已完成」：与计划单号标签同色（indigo） */
const PLAN_COMPLETED_CLASS = 'bg-indigo-50 text-indigo-600 border border-indigo-100';
/** 工单「已完成」：与工单号标签同色（indigo） */
const ORDER_COMPLETED_CLASS = 'bg-indigo-50 text-indigo-600 border border-indigo-100';
const IN_PROGRESS_CLASS = 'bg-amber-50 text-amber-700 border border-amber-200';
const NOT_DISPATCHED_CLASS = 'bg-slate-100 text-slate-600 border border-slate-200';

export function getPlanDispatchStatusStyle(status: PlanDispatchStatus | undefined): DispatchStatusStyle {
  switch (status) {
    case PlanDispatchStatus.COMPLETED:
      return { label: PLAN_DISPATCH_STATUS_LABEL.COMPLETED, className: PLAN_COMPLETED_CLASS };
    case PlanDispatchStatus.IN_PROGRESS:
      return { label: PLAN_DISPATCH_STATUS_LABEL.IN_PROGRESS, className: IN_PROGRESS_CLASS };
    case PlanDispatchStatus.NOT_DISPATCHED:
    default:
      return { label: PLAN_DISPATCH_STATUS_LABEL.NOT_DISPATCHED, className: NOT_DISPATCHED_CLASS };
  }
}

export function getOrderDispatchStatusStyle(status: OrderDispatchStatus | undefined): DispatchStatusStyle {
  if (status === OrderDispatchStatus.COMPLETED) {
    return { label: ORDER_DISPATCH_STATUS_LABEL.COMPLETED, className: ORDER_COMPLETED_CLASS };
  }
  return { label: ORDER_DISPATCH_STATUS_LABEL.IN_PROGRESS, className: IN_PROGRESS_CLASS };
}
