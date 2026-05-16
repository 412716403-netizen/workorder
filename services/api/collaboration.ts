import { request } from './_client';
import type { CollabAcceptTransferBody } from '../../types';

// ── Collaboration (企业间协作) ──
export const collaboration = {
  createCollaboration: (data: { inviteCode: string }) =>
    request<any>('/collaboration/collaborations', { method: 'POST', body: JSON.stringify(data) }),
  listCollaborations: () =>
    request<any[]>('/collaboration/collaborations?all=true'),
  /** 单方解除企业协作（后端对双方租户同时清理绑定） */
  revokeCollaboration: (collaborationId: string) =>
    request<{ success: boolean; alreadyRevoked?: boolean }>(`/collaboration/collaborations/${collaborationId}`, {
      method: 'DELETE',
    }),

  syncDispatch: (data: { recordIds: string[]; collaborationTenantId: string; outsourceRouteId?: string }) =>
    request<{ dispatches: { transferId: string; dispatchId: string; productName: string }[] }>(
      '/collaboration/subcontract-transfers/sync-dispatch',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  listTransfers: (params?: Record<string, string>) => {
    const merged = { all: 'true', ...(params ?? {}) };
    const qs = '?' + new URLSearchParams(merged).toString();
    return request<any[]>(`/collaboration/subcontract-transfers${qs}`);
  },
  getTransfer: (id: string) =>
    request<any>(`/collaboration/subcontract-transfers/${id}`),

  acceptTransfer: (id: string, data: CollabAcceptTransferBody) =>
    request<any>(`/collaboration/subcontract-transfers/${id}/accept`, { method: 'POST', body: JSON.stringify(data) }),
  forwardTransfer: (id: string, data: { items: Array<{ colorName: string | null; sizeName: string | null; quantity: number }>; note?: string; warehouseId?: string; sharedDispatchDocNo?: string; unitPrice?: number }) =>
    request<{ newTransferId: string; dispatchId: string; nextStep: any; dispatchDocNo: string | null }>(`/collaboration/subcontract-transfers/${id}/forward`, { method: 'POST', body: JSON.stringify(data) }),
  confirmForward: (id: string) =>
    request<any>(`/collaboration/subcontract-transfers/${id}/confirm-forward`, { method: 'PATCH' }),
  createReturn: (id: string, data: any) =>
    request<any>(`/collaboration/subcontract-transfers/${id}/returns`, { method: 'POST', body: JSON.stringify(data) }),
  receiveReturn: (id: string) =>
    request<any>(`/collaboration/subcontract-returns/${id}/receive`, { method: 'PATCH' }),

  withdrawDispatch: (id: string) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/withdraw`, { method: 'PATCH' }),
  withdrawReturn: (id: string) =>
    request<any>(`/collaboration/subcontract-returns/${id}/withdraw`, { method: 'PATCH' }),
  withdrawForward: (id: string) =>
    request<any>(`/collaboration/subcontract-transfers/${id}/withdraw-forward`, { method: 'PATCH' }),
  deleteDispatch: (id: string) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}`, { method: 'DELETE' }),
  deleteReturn: (id: string) =>
    request<any>(`/collaboration/subcontract-returns/${id}`, { method: 'DELETE' }),

  // Dispatch 编辑同步
  updateDispatchPayload: (id: string, data: { recordIds: string[] }) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/payload`, { method: 'PUT', body: JSON.stringify(data) }),
  amendDispatch: (id: string, data: { recordIds: string[]; note?: string }) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/amend`, { method: 'POST', body: JSON.stringify(data) }),
  confirmDispatchAmendment: (id: string) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/confirm-amendment`, { method: 'PATCH' }),
  rejectDispatchAmendment: (id: string) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/reject-amendment`, { method: 'PATCH' }),
  ackDispatchPayloadRefresh: (id: string) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/ack-payload-refresh`, { method: 'PATCH' }),

  // Return 编辑同步
  updateReturnPayload: (id: string, data: { items: any[]; note?: string; warehouseId?: string }) =>
    request<any>(`/collaboration/subcontract-returns/${id}/payload`, { method: 'PUT', body: JSON.stringify(data) }),
  amendReturn: (id: string, data: { items: any[]; note?: string }) =>
    request<any>(`/collaboration/subcontract-returns/${id}/amend`, { method: 'POST', body: JSON.stringify(data) }),
  confirmReturnAmendment: (id: string) =>
    request<any>(`/collaboration/subcontract-returns/${id}/confirm-amendment`, { method: 'PATCH' }),
  rejectReturnAmendment: (id: string) =>
    request<any>(`/collaboration/subcontract-returns/${id}/reject-amendment`, { method: 'PATCH' }),

  listOutsourceRoutes: () =>
    request<any[]>('/collaboration/outsource-routes?all=true'),
  createOutsourceRoute: (data: { name: string; steps: any[] }) =>
    request<any>('/collaboration/outsource-routes', { method: 'POST', body: JSON.stringify(data) }),
  updateOutsourceRoute: (id: string, data: { name?: string; steps?: any[] }) =>
    request<any>(`/collaboration/outsource-routes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOutsourceRoute: (id: string) =>
    request(`/collaboration/outsource-routes/${id}`, { method: 'DELETE' }),

  listProductMaps: (collaborationId?: string) => {
    const qs = new URLSearchParams({ all: 'true' });
    if (collaborationId) qs.set('collaborationId', collaborationId);
    return request<any[]>(`/collaboration/collaboration-product-maps?${qs.toString()}`);
  },
  updateProductMap: (id: string, data: any) =>
    request<any>(`/collaboration/collaboration-product-maps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProductMap: (id: string) =>
    request(`/collaboration/collaboration-product-maps/${id}`, { method: 'DELETE' }),
};

// ── 单品码（ItemCode）──

export const itemCodesApi = {
  generate: (planOrderId: string) =>
    request<{ generated: number; totalForPlan: number; byVariant: Array<{ variantId: string | null; count: number }> }>(
      '/item-codes/generate',
      { method: 'POST', body: JSON.stringify({ planOrderId }) },
    ),

  list: (params: {
    planOrderId?: string;
    variantId?: string;
    batchId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
    /** 仅兼容旧「全量」拉取；默认不传，走服务端分页（page/pageSize）。 */
    all?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params.all === true) qs.set('all', 'true');
    if (params.planOrderId) qs.set('planOrderId', params.planOrderId);
    if (params.variantId) qs.set('variantId', params.variantId);
    if (params.batchId) qs.set('batchId', params.batchId);
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return request<{ items: import('../../types').ItemCode[]; total: number; page: number; pageSize: number }>(
      `/item-codes?${qs.toString()}`,
    );
  },

  scan: (token: string) =>
    request<import('../../types').ScanResult>(`/item-codes/scan/${encodeURIComponent(token)}`),

  trace: (token: string, params?: { page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page != null) qs.set('page', String(params.page));
    if (params?.pageSize != null) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return request<import('../../types').TraceResult>(
      `/item-codes/trace/${encodeURIComponent(token)}${q ? `?${q}` : ''}`,
    );
  },

  /**
   * 扫码二次校验（持久化去重 + 单据数量上限）。
   * 报工 / 入库 / 返工 / 外协收货等场景在扫码成功后、改表单前调用。
   */
  validateUsage: (body: import('../../types').ScanValidateRequest) =>
    request<import('../../types').ScanValidateResponse>('/item-codes/scan/validate-usage', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const planVirtualBatchesApi = {
  create: (body: {
    planOrderId: string;
    variantId?: string | null;
    quantity: number;
    withItemCodes?: boolean;
  }) =>
    request<import('../../types').PlanVirtualBatch & { itemCodesCreated?: number }>('/plan-virtual-batches', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  bulkSplit: (body: {
    planOrderId: string;
    variantId?: string | null;
    batchSize: number;
    withItemCodes?: boolean;
  }) =>
    request<{
      created: number;
      items: import('../../types').PlanVirtualBatch[];
      batchSize: number;
      quantities: number[];
      totalQuantity: number;
      maxFromPlan: number;
      allocatedBefore: number;
      itemCodesCreated?: number;
    }>('/plan-virtual-batches/bulk-split', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** 计划树内各规格分别按每批件数拆完剩余额度（一键生成全部规格），无需指定 variantId */
  bulkSplitAll: (body: { planOrderId: string; batchSize: number; withItemCodes?: boolean }) =>
    request<{
      totalCreated: number;
      items: import('../../types').PlanVirtualBatch[];
      batchSize: number;
      byVariant: Array<{
        variantId: string | null;
        created: number;
        quantities: number[];
        totalQty: number;
      }>;
      itemCodesCreated?: number;
    }>('/plan-virtual-batches/bulk-split-all', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  list: (params: { planOrderId?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    qs.set('all', 'true');
    if (params.planOrderId) qs.set('planOrderId', params.planOrderId);
    if (params.page != null) qs.set('page', String(params.page));
    if (params.pageSize != null) qs.set('pageSize', String(params.pageSize));
    return request<{
      items: import('../../types').PlanVirtualBatch[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/plan-virtual-batches?${qs.toString()}`);
  },

  subtreeAllocations: (params: { rootPlanOrderId: string }) =>
    request<{
      productId: string;
      allocations: Array<{ variantId: string | null; allocated: number }>;
    }>(
      `/plan-virtual-batches/subtree-allocations?${new URLSearchParams({
        rootPlanOrderId: params.rootPlanOrderId,
      }).toString()}`,
    ),

  scan: (token: string) =>
    request<import('../../types').ScanResult>(`/plan-virtual-batches/scan/${encodeURIComponent(token)}`),

  trace: (token: string, params?: { page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page != null) qs.set('page', String(params.page));
    if (params?.pageSize != null) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return request<import('../../types').TraceResult>(
      `/plan-virtual-batches/trace/${encodeURIComponent(token)}${q ? `?${q}` : ''}`,
    );
  },
};
