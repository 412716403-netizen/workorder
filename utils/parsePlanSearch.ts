import { PlanDispatchStatus, PLAN_DISPATCH_STATUS_BY_LABEL } from '../types';

export interface ParsedPlanSearch {
  /** 计划单号 / 客户的模糊关键字，传给后端 search */
  search: string;
  /** 派生状态过滤（仅工单模式启用） */
  dispatchStatus?: PlanDispatchStatus;
}

/**
 * 解析计划单列表搜索框输入。
 *
 * 规则：
 * - 输入精确等于「未下单 / 未完成 / 已完成」其中之一（trim 后） → 视为状态过滤，search 置空。
 * - 否则保持为普通模糊搜索（计划单号 / 客户），不传 dispatchStatus。
 *
 * 设计取舍：不支持「状态 + 关键字」组合，避免歧义；且后端状态过滤是内存全量分页，
 * 与文本搜索同时使用会让结果范围难以描述。
 *
 * 仅在「关联工单模式 productionLinkMode='order'」的 PlanOrderListView 中启用；
 * 产品模式直接把整段文本作为 search 透传即可（调用方判断）。
 */
export function parsePlanSearch(raw: string | null | undefined): ParsedPlanSearch {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { search: '' };
  const matched = PLAN_DISPATCH_STATUS_BY_LABEL[trimmed];
  if (matched) return { search: '', dispatchStatus: matched };
  return { search: trimmed };
}
