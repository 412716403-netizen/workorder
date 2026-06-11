import { request, crud, buildQs, type PaginatedResponse, type PaginationParams } from './_client';
import type {
  ProductionOrder,
  ProductionOpRecord,
  ProductMilestoneProgress,
  MilestoneReport,
  ReportFieldDefinition,
  GlobalNodeTemplate,
} from '../../types';
import type { OrderDispatchStatus } from '../../types';

// ── Orders ──
const ordersCrud = crud<ProductionOrder>('/orders');

export const orders = {
  ...ordersCrud,
  /** 分页接口，必须返回 { data, total, page, pageSize }；不要叠 all=true */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<ProductionOrder>>(`/orders${buildQs(params)}`),
  createReport: (orderId: string, milestoneId: string, data: unknown) =>
    request<ProductionOrder>(`/orders/${orderId}/milestones/${milestoneId}/reports`, { method: 'POST', body: JSON.stringify(data) }),
  updateReport: (orderId: string, milestoneId: string, reportId: string, data: unknown) =>
    request<ProductionOrder>(`/orders/${orderId}/milestones/${milestoneId}/reports/${reportId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReport: (orderId: string, milestoneId: string, reportId: string) =>
    request<void>(`/orders/${orderId}/milestones/${milestoneId}/reports/${reportId}`, { method: 'DELETE' }),
  /** 当前工单可报工的里程碑信息（含完成/在制数等） */
  getReportable: (orderId: string) =>
    request<{ milestones: Array<{ id: string; templateId: string; name: string; canReport: boolean }> }>(`/orders/${orderId}/reportable`),
  createProductReport: (data: unknown) =>
    request<MilestoneReport>('/orders/product-progress/report', { method: 'POST', body: JSON.stringify(data) }),
  updateProductReport: (reportId: string, data: unknown) =>
    request<MilestoneReport>(`/orders/product-progress/report/${reportId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProductReport: (reportId: string) =>
    request<void>(`/orders/product-progress/report/${reportId}`, { method: 'DELETE' }),
  listProductProgress: () => request<ProductMilestoneProgress[]>('/orders/product-progress?all=true'),
  /** Phase 3.E：报工流水弹窗按日期窗口窄拉，避免遍历全部工单内嵌 reports */
  listReportHistory: (params: {
    startDate?: string;
    endDate?: string;
    orderIds?: string;
    productIds?: string;
    search?: string;
    productionLinkMode?: 'order' | 'product';
  }) =>
    request<{ orderReports: MilestoneReport[]; productReports: MilestoneReport[] }>(`/orders/report-history${buildQs(params)}`),
  /**
   * 手动切换工单派发完成状态（关联工单模式下工单中心徽章点击）。
   * 后端会同时把 `dispatchStatusManual` 置为 true，之后 STOCK_IN 入库自动逻辑不再覆盖。
   */
  updateDispatchStatus: (orderId: string, status: OrderDispatchStatus) =>
    request<ProductionOrder>(`/orders/${orderId}/dispatch-status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  /** 工单中心表单配置：批量保存工序报工自定义单据字段 */
  updateNodeReportTemplates: (updates: { nodeId: string; reportTemplate: ReportFieldDefinition[] }[]) =>
    request<{ updated: GlobalNodeTemplate[] }>('/orders/node-report-templates', {
      method: 'PUT',
      body: JSON.stringify({ updates }),
    }),
};

// ── Production ──
export interface ProductionFilter {
  type?: string;
  /** Phase 3.C：多 type 窄拉，前端按 tab 用 ['STOCK_OUT','STOCK_RETURN'] 等，逗号传给后端 */
  types?: string;
  orderId?: string;
  /** 逗号分隔多 id，与 productIds 组合时后端按 OR 作用域过滤 */
  orderIds?: string;
  productId?: string;
  productIds?: string;
  /** 关联产品模式领退料按"成品" sourceProductId 收口（逗号分隔，与 orderIds / productIds OR 作用域） */
  sourceProductIds?: string;
  workerId?: string;
  partner?: string;
  status?: string;
  docNo?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface ProductionSummary {
  byType: Array<{ type: string; quantity: number; weight: number; count: number }>;
  byStatus: Array<{ type: string; status: string | null; count: number }>;
  byWorker: Array<{ workerId: string | null; quantity: number; weight: number; count: number }>;
  byPartner: Array<{ partner: string | null; quantity: number; weight: number; count: number }>;
}

const productionCrud = crud<ProductionOpRecord>('/production/records');

export const production = {
  ...productionCrud,
  /**
   * 批量写入；后端会在"全部记录同 type、全部缺省 docNo、且 OUTSOURCE 时 partner 一致"的情况下，
   * **共享分配**一个 docNo 给整批；其它情况退化为逐条 createRecord 的语义。
   */
  createBatch: (records: ProductionOpRecord[]) =>
    request<ProductionOpRecord[]>('/production/records/batch', { method: 'POST', body: JSON.stringify({ records }) }),
  /** 分页接口，必须返回 { data, total, page, pageSize }；不要叠 all=true */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<ProductionOpRecord>>(`/production/records${buildQs(params)}`),
  /** Phase 3.C：分页友好的列表接口，新视图应优先使用，不再拉全量 */
  listPage: (params: PaginationParams & ProductionFilter & Record<string, string | number | undefined> = {}) =>
    request<PaginatedResponse<ProductionOpRecord>>(`/production/records${buildQs(params)}`),
  /** Phase 3.C：后端聚合接口，看板/报表类视图直接消费聚合结果 */
  summary: (params: ProductionFilter & { topWorkers?: number; topPartners?: number } = {}) =>
    request<ProductionSummary>(`/production/summary${buildQs(params as Record<string, string | number | undefined>)}`),
  getDefectiveRework: () =>
    request<Array<{ orderId: string; productId: string; defectiveQty: number; reworkQty: number }>>('/production/defective-rework'),
};
