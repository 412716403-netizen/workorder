import { request, crud, buildQs, type PaginationParams } from './_client';
import type { ReceiveUnitWeightAveragesResponse, ProductVariantUsageResponse } from '../../types';

const productsCrud = crud('/products');

// ── Products ──
export const products = {
  ...productsCrud,
  /**
   * Phase 3.F：列表默认 lite=true——后端只裁 economics* 经营核算规则 JSON，
   * routeReportValues / routeReportDisplayValues / nodeRates / variants（含 nodeBoms）全保留。
   * 需要完整字段时传 { lite: 'false' } 覆盖，或用 get(id) 拉单个产品全量。
   */
  list: (params?: PaginationParams | Record<string, string>) =>
    productsCrud.list({ lite: 'true', ...(params ?? {}) }),
  listVariants: (productId: string) => request(`/products/${productId}/variants`),
  syncVariants: (productId: string, variants: unknown[]) =>
    request(`/products/${productId}/variants`, { method: 'POST', body: JSON.stringify({ variants }) }),
  receiveUnitWeightAverages: (productId: string) =>
    request<ReceiveUnitWeightAveragesResponse>(`/products/${productId}/receive-unit-weight-averages`),
  /** 删除颜色/尺码（变体）前查询业务引用情况 */
  variantUsage: (productId: string, variantIds: string[]) =>
    request<ProductVariantUsageResponse>(
      `/products/${productId}/variant-usage${buildQs({ variantIds: variantIds.join(',') })}`,
    ),
  import: (data: { categoryId: string; products: unknown[]; newDictionaryItems?: unknown[] }) =>
    request('/products/import', { method: 'POST', body: JSON.stringify(data) }),
};

export const boms = {
  list: (params?: Record<string, string>) => {
    const qs = buildQs({ all: 'true', ...(params ?? {}) });
    return request(`/products/boms/all${qs}`);
  },
  get: (id: string) => request(`/products/boms/${id}`),
  create: (data: unknown) => request('/products/boms', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) => request(`/products/boms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/products/boms/${id}`, { method: 'DELETE' }),
};
