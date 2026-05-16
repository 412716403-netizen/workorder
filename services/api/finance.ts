import { request, crud, buildQs, type PaginatedResponse, type PaginationParams } from './_client';
import type { FinanceRecord } from '../../types';

// ── Finance ──
export interface FinanceFilter {
  type?: string;
  status?: string;
  categoryId?: string;
  partner?: string;
  partnerId?: string;
  operator?: string;
  workerId?: string;
  productId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface FinanceSummary {
  byType: Array<{ type: string; amount: number; count: number }>;
  byStatus: Array<{ type: string; status: string; amount: number; count: number }>;
  byCategory: Array<{ categoryId: string | null; amount: number; count: number }>;
  topPartners: Array<{ partner: string | null; amount: number }>;
}

const financeCrud = crud<FinanceRecord>('/finance/records');

export const finance = {
  ...financeCrud,
  /** Phase 3.A：分页 + 过滤接口，新业务页应优先用这个，避免一次拉全量 */
  listPage: (params: PaginationParams & FinanceFilter & Record<string, string | number | undefined> = {}) =>
    request<PaginatedResponse<FinanceRecord>>(`/finance/records${buildQs(params)}`),
  /** 兼容老叫法，与 listPage 等价；保持向后兼容期不删除 */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<FinanceRecord>>(`/finance/records${buildQs(params)}`),
  /** Phase 3.A：后端聚合接口，对账类视图改用此接口，不再前端遍历全量 */
  summary: (params: FinanceFilter & { topPartners?: number } = {}) =>
    request<FinanceSummary>(`/finance/summary${buildQs(params as Record<string, string | number | undefined>)}`),
  /**
   * Phase 3.D follow-up：销售单打印「上次结余」窄查接口。
   * - partnerName 为必填（财务记录按 name 精确匹配；后端 PSI 也按 (partnerId or partnerName) OR 匹配）。
   * - before：ISO 时间字符串，截止时刻；返回严格早于此时刻的应收余额。
   * - excludeSalesBillDocNumber：编辑销售单时排除自身。
   */
  partnerReceivable: (params: {
    partnerName: string;
    partnerId?: string;
    before: string;
    excludeSalesBillDocNumber?: string;
  }) =>
    request<{ previousBalance: number; anchorTimeMs: number }>(
      `/finance/partner-receivable${buildQs({
        partnerName: params.partnerName,
        partnerId: params.partnerId,
        before: params.before,
        excludeSalesBillDocNumber: params.excludeSalesBillDocNumber,
      })}`,
    ),
  /** 合作单位对账「上期余额」；与 partnerReceivable 同口径，权限走对账模块 */
  partnerOpeningBalance: (params: {
    partnerName: string;
    partnerId?: string;
    before: string;
  }) =>
    request<{ previousBalance: number; anchorTimeMs: number }>(
      `/finance/reconciliation/partner-opening-balance${buildQs({
        partnerName: params.partnerName,
        partnerId: params.partnerId,
        before: params.before,
      })}`,
    ),
};
