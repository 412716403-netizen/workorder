import { request, crud, buildQs, type PaginatedResponse, type PaginationParams } from './_client';
import type { PlanOrder } from '../../types';

// ── Plans ──
const plansCrud = crud<PlanOrder>('/plans');

export const plans = {
  ...plansCrud,
  /** 分页接口，必须返回 { data, total, page, pageSize }；不要叠 all=true，否则后端走全量分支返回数组导致 .data undefined */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<PlanOrder>>(`/plans${buildQs(params)}`),
  convert: (id: string) => request<PlanOrder>(`/plans/${id}/convert`, { method: 'POST' }),
  createSubPlans: (id: string, subPlans: unknown[]) =>
    request<PlanOrder[]>(`/plans/${id}/sub-plans`, { method: 'POST', body: JSON.stringify({ subPlans }) }),
};
