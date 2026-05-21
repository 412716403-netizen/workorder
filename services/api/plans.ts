import { request, crud, buildQs, type PaginatedResponse, type PaginationParams } from './_client';
import type { PlanOrder, PlanDispatchStatus } from '../../types';

/**
 * 计划单分页接口参数。
 * `dispatchStatus` 仅在工单模式列表搜索状态关键字（未下单/未完成/已完成）时传入；
 * 后端会以「全量 where 命中 → 内存按派生状态过滤 → 切片分页」的方式响应。
 * 含 `[key: string]: string | number | undefined` 索引签名以兼容 `buildQs`。
 */
export interface PlanListParams {
  page?: string;
  pageSize?: string;
  search?: string;
  status?: string;
  productId?: string;
  dispatchStatus?: PlanDispatchStatus;
  /** 为 true 时仅返回未下单/未完成（隐藏已完成） */
  excludeCompleted?: string;
  [key: string]: string | number | undefined;
}

// ── Plans ──
const plansCrud = crud<PlanOrder>('/plans');

export const plans = {
  ...plansCrud,
  /** 分页接口，必须返回 { data, total, page, pageSize }；不要叠 all=true，否则后端走全量分支返回数组导致 .data undefined */
  listPaginated: (params: PlanListParams | PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<PlanOrder>>(`/plans${buildQs(params as Record<string, string>)}`),
  convert: (id: string) => request<PlanOrder>(`/plans/${id}/convert`, { method: 'POST' }),
  createSubPlans: (id: string, subPlans: unknown[]) =>
    request<PlanOrder[]>(`/plans/${id}/sub-plans`, { method: 'POST', body: JSON.stringify({ subPlans }) }),
};
