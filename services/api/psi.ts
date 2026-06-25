import { request, buildQs, type PaginatedResponse, type PaginationParams } from './_client';
import type { PsiRecord } from '../../types';

// ── PSI ──
export interface StockSnapshotBucket {
  productId: string;
  warehouseId: string;
  variantId?: string;
  batchNo?: string;
  psiIn: number;
  psiOut: number;
  transferIn: number;
  transferOut: number;
  /** Phase 3.B：仅 byVariant 桶有；若变体下存在盘点记录，等价于前端 getVariantDisplayQty 结果 */
  displayQty?: number;
  prodIn: number;
  prodOut: number;
  stocktakeAdj: number;
}

export const psi = {
  list: (params?: PaginationParams | Record<string, string>) => {
    return request<PsiRecord[]>(`/psi/records${buildQs({ all: 'true', ...(params ?? {}) })}`);
  },
  /** 分页接口，必须返回 { data, total, page, pageSize }；不要叠 all=true */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<PsiRecord>>(`/psi/records${buildQs(params)}`),
  create: (data: Partial<PsiRecord>) =>
    request<PsiRecord>('/psi/records', { method: 'POST', body: JSON.stringify(data) }),
  createBatch: (records: Partial<PsiRecord>[]) =>
    request<PsiRecord[]>('/psi/records/batch', { method: 'POST', body: JSON.stringify({ records }) }),
  update: (id: string, data: Partial<PsiRecord>) =>
    request<PsiRecord>(`/psi/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  replace: (deleteIds: string[], newRecords: Partial<PsiRecord>[]) =>
    request<PsiRecord[]>('/psi/records/replace', { method: 'PUT', body: JSON.stringify({ deleteIds, newRecords }) }),
  delete: (id: string) => request<void>(`/psi/records/${id}`, { method: 'DELETE' }),
  deleteBatch: (ids: string[]) =>
    request<void>('/psi/records', { method: 'DELETE', body: JSON.stringify({ ids }) }),
  /** Phase 3.B：库存快照，替代前端 usePsiStockIndex 全量遍历；支持按 productId/warehouseId 缩窄。 */
  getStockSnapshot: (params?: { productId?: string; warehouseId?: string }) =>
    request<{
      byWarehouse: StockSnapshotBucket[];
      byVariant: StockSnapshotBucket[];
      byBatch: StockSnapshotBucket[];
    }>(`/psi/stock-snapshot${buildQs(params as Record<string, string | number | undefined> | undefined)}`),
  getStock: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/psi/stock${qs}`);
  },
  /** 按批次汇总某产品在某仓库的可用库存（仅 batchNo 非空流水） */
  getStockBatches: (params: Record<string, string>) => {
    const qs = '?' + new URLSearchParams(params).toString();
    return request<Array<{ batchNo: string; stock: number }>>(`/psi/stock/batches${qs}`);
  },
  /**
   * Phase 3.D follow-up：计划详情面板"计划相关 PSI"窄查接口。
   * 返回：{ purchaseOrders: PSI[], purchaseBills: PSI[] }——前端按需自己算 receivedByOrderLine。
   */
  planRelated: (params: { planId: string; planNumbers?: string[] }) =>
    request<{ purchaseOrders: PsiRecord[]; purchaseBills: PsiRecord[] }>(
      `/psi/plan-related${buildQs({
        planId: params.planId,
        planNumbers: (params.planNumbers ?? []).join(','),
      })}`,
    ),
  /**
   * 计划单列表「采购订单进度」批量汇总：按数量加权返回每个计划的 { received, ordered }，
   * 百分比由前端计算（Σ已收 / Σ已订购）。开关 listDisplay.showPurchaseProgress 开启时调用。
   */
  plansPurchaseProgress: (plans: Array<{ planId: string; planNumbers?: string[] }>) =>
    request<Array<{ planId: string; received: number; ordered: number }>>(
      '/psi/plans-purchase-progress',
      { method: 'POST', body: JSON.stringify({ plans }) },
    ),
  /**
   * Phase 3.D follow-up：按合作单位预生成 PSI 单号。
   * - prefix 必填；psiType 必填（PURCHASE_ORDER / PURCHASE_BILL / SALES_ORDER / SALES_BILL）。
   * - 后端会按 (partnerId 或 partnerName) 精确匹配；legacyPrefixes 可叠加旧前缀（如 SB → XS 改前缀场景）。
   */
  nextDocNumber: (params: {
    prefix: string;
    psiType: string;
    partnerId?: string;
    partnerName?: string;
    legacyPrefixes?: string[];
  }) =>
    request<{ docNumber: string; segment: string; seq: number }>(
      `/psi/next-doc-number${buildQs({
        prefix: params.prefix,
        psiType: params.psiType,
        partnerId: params.partnerId,
        partnerName: params.partnerName,
        legacyPrefixes: (params.legacyPrefixes ?? []).join(','),
      })}`,
    ),
  /** Phase 3.D follow-up：批量 (partner, product) → 上次采购单价 */
  lastPurchasePrices: (items: Array<{ partnerId?: string; partnerName?: string; productId: string }>) =>
    request<Array<{ price: number | null }>>(`/psi/last-purchase-prices`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
};
