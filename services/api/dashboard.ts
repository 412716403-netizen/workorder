import { request } from './_client';
import type {
  WorkbenchConfig,
  FeaturePluginsConfig,
  MaterialPriceSettingsResponse,
  MaterialPriceParentProductRow,
  MaterialPriceBomMaterialRow,
  MaterialPriceBomMaterialsResponse,
  MaterialPriceRule,
  MaterialPriceRuleOverride,
  TheoreticalCostBreakdown,
  ProcessPriceParentProductRow,
  ProcessPriceNodesResponse,
  ProcessPriceNodeRow,
} from '../../types';

export interface WorkbenchResponse {
  effective: WorkbenchConfig;
}

export interface WorkbenchPageSummary {
  id: string;
  title: string;
  createdByUserId: string | null;
  creatorName: string | null;
}

export interface DashboardNotification {
  id: string;
  type: 'system' | 'announcement' | 'expiry_reminder' | 'todo';
  title: string;
  body: string;
  createdAt: string;
  href?: string;
  publisherName?: string;
  /** 待办类消息完成状态（标题不再追加「已完成」，改由复选框/按钮展示） */
  done?: boolean;
}

export interface PublishedMessageRow {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  publisherName: string;
}

export interface DashboardOrderStatsRow {
  templateId: string;
  name: string;
  taskCount: number;
  maxReportableQty: number;
  reportedQty: number;
  remainingQty: number;
  goodQty: number;
  defectiveQty: number;
  progress: number;
}

export interface OrderStatsSettingsResponse {
  selected: string[];
  defaults: string[];
  hasCustom: boolean;
  nodes: { id: string; name: string }[];
}

export interface OrderStatsResponse {
  period: 'today' | 'yesterday' | 'month' | null;
  customRange: { startDate: string; endDate: string } | null;
  includeNotStarted: boolean;
  rows: DashboardOrderStatsRow[];
}

export interface DashboardOutsourceStatsRow {
  templateId: string;
  name: string;
  taskCount: number;
  pendingQty: number;
  receivedQty: number;
  dispatchedQty: number;
  progress: number;
}

export interface DashboardReworkStatsRow {
  templateId: string;
  name: string;
  taskCount: number;
  pendingQty: number;
  completedQty: number;
  newReworkQty: number;
  progress: number;
}

export interface NodeStatsSettingsResponse {
  selected: string[];
  defaults: string[];
  hasCustom: boolean;
  nodes: { id: string; name: string }[];
}

export interface OutsourceStatsResponse {
  period: 'today' | 'yesterday' | 'month' | null;
  customRange: { startDate: string; endDate: string } | null;
  rows: DashboardOutsourceStatsRow[];
}

export interface ReworkStatsResponse {
  period: 'today' | 'yesterday' | 'month' | null;
  customRange: { startDate: string; endDate: string } | null;
  rows: DashboardReworkStatsRow[];
}

export interface DashboardStats {
  production?: {
    activeOrders: number;
    totalMilestones: number;
    completedMilestones: number;
    completionRate: number;
    trend: { date: string; quantity: number; count: number }[];
  };
  sales?: {
    period: 'today' | 'yesterday' | 'month' | null;
    customRange?: { startDate: string; endDate: string } | null;
    salesBillCount: number;
    salesAmount: number;
    salesQuantity: number;
    salesReturnQuantity: number;
  };
  salesOrder?: {
    period: 'today' | 'yesterday' | 'month' | null;
    customRange?: { startDate: string; endDate: string } | null;
    salesOrderCount: number;
    salesOrderAmount: number;
    salesOrderQuantity: number;
    salesOrderReduceQuantity: number;
  };
  finance?: {
    period: 'today' | 'yesterday' | 'month' | null;
    customRange?: { startDate: string; endDate: string } | null;
    receiptAmount: number;
    paymentAmount: number;
    cashFlow: number;
    receiptCount: number;
    paymentCount: number;
  };
}

export interface ProductEconomicsRow {
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  /** 是否配置了标准生产路线（milestoneNodeIds 非空） */
  hasProcessNodes: boolean;
  materialCost: number;
  reportCost: number;
  outsourceFee: number;
  reworkFee: number;
  materialSurplusLoss: number;
  linkedPurchaseCost: number;
  linkedPaymentCost: number;
  linkedReceiptAmount: number;
  scrapQty: number;
  scrapAmount: number;
  stockQty: number;
  salesQty: number;
  salesAmount: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  theoreticalUnitCost: number;
}

export interface ProductEconomicsListResponse {
  canProduction: boolean;
  canPsi: boolean;
  canFinance: boolean;
  materialCostMode: 'consumable' | 'document_linked';
  period: 'today' | 'yesterday' | 'month' | null;
  customRange: { startDate: string; endDate: string } | null;
  summary: {
    productCount: number;
    totalCost: number;
    totalSalesAmount: number;
    totalRevenue: number;
    grossProfit: number;
  };
  rows: ProductEconomicsRow[];
}

export interface ProductEconomicsNodeRow {
  nodeId: string;
  nodeName: string;
  hasNodeBom: boolean;
  materialCost: number;
  materialQty: number;
  reportCost: number;
  outsourceFee: number;
  reworkFee: number;
  reportQty: number;
  outsourceQty: number;
  reworkQty: number;
}

export interface ProductEconomicsDetailResponse {
  canProduction: boolean;
  canPsi: boolean;
  canFinance: boolean;
  materialCostMode: 'consumable' | 'document_linked';
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  materialCost: number;
  reportCost: number;
  outsourceFee: number;
  reworkFee: number;
  materialSurplusLoss: number;
  linkedPurchaseCost: number;
  linkedPaymentCost: number;
  linkedReceiptAmount: number;
  scrapQty: number;
  scrapAmount: number;
  stockQty: number;
  salesQty: number;
  salesAmount: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  theoreticalUnitCost: number;
  theoreticalCostBreakdown: TheoreticalCostBreakdown;
  totalOrderQty: number;
  stockInQty: number;
  byNode: ProductEconomicsNodeRow[];
}

export interface FinancePartnerStatsSlice {
  partner: string;
  amount: number;
}

export interface FinancePartnerStatsResponse {
  summary: {
    periodReceivable: number;
    periodPayable: number;
    remainingReceivable: number;
    remainingPayable: number;
  };
  periodReceivableByPartner: FinancePartnerStatsSlice[];
  periodPayableByPartner: FinancePartnerStatsSlice[];
  remainingReceivableByPartner: FinancePartnerStatsSlice[];
  remainingPayableByPartner: FinancePartnerStatsSlice[];
}

export interface ShortcutsResponse {
  selected: string[];
  defaults: string[];
  hasCustom: boolean;
}

type WorkbenchStatsQueryParams = {
  period?: 'today' | 'yesterday' | 'month';
  startDate?: string;
  endDate?: string;
  includeNotStarted?: boolean;
  days?: number;
  materialCostMode?: 'consumable' | 'document_linked';
};

function appendWorkbenchStatsQuery(search: URLSearchParams, params: WorkbenchStatsQueryParams) {
  if (params.period) search.set('period', params.period);
  if (params.startDate) search.set('startDate', params.startDate);
  if (params.endDate) search.set('endDate', params.endDate);
  if (params.includeNotStarted) search.set('includeNotStarted', '1');
  if (params.days != null) search.set('days', String(params.days));
  if (params.materialCostMode) search.set('materialCostMode', params.materialCostMode);
}

export const dashboard = {
  getWorkbench: () => request<WorkbenchResponse>('/dashboard/workbench'),
  saveWorkbench: (config: WorkbenchConfig) =>
    request<WorkbenchConfig>('/dashboard/workbench', { method: 'PUT', body: JSON.stringify(config) }),
  getWorkbenchPages: () =>
    request<{ pages: WorkbenchPageSummary[] }>('/dashboard/workbench/pages'),
  getShortcuts: () => request<ShortcutsResponse>('/dashboard/shortcuts'),
  saveShortcuts: (ids: string[]) =>
    request<{ selected: string[] }>('/dashboard/shortcuts', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
  getFeaturePlugins: () => request<FeaturePluginsConfig>('/dashboard/feature-plugins'),
  updateFeaturePlugins: (body: FeaturePluginsConfig) =>
    request<FeaturePluginsConfig>('/dashboard/feature-plugins', { method: 'PUT', body: JSON.stringify(body) }),
  getStats: (params: WorkbenchStatsQueryParams = {}) => {
    const search = new URLSearchParams();
    appendWorkbenchStatsQuery(search, params);
    const qs = search.toString();
    return request<DashboardStats>(`/dashboard/stats${qs ? `?${qs}` : ''}`);
  },
  getOrderStatsSettings: () => request<OrderStatsSettingsResponse>('/dashboard/order-stats/settings'),
  saveOrderStatsSettings: (ids: string[]) =>
    request<{ selected: string[] }>('/dashboard/order-stats/settings', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
  getOrderStats: (params: WorkbenchStatsQueryParams = {}) => {
    const search = new URLSearchParams();
    appendWorkbenchStatsQuery(search, params);
    const qs = search.toString();
    return request<OrderStatsResponse | null>(`/dashboard/order-stats${qs ? `?${qs}` : ''}`);
  },
  getOutsourceStatsSettings: () => request<NodeStatsSettingsResponse>('/dashboard/outsource-stats/settings'),
  saveOutsourceStatsSettings: (ids: string[]) =>
    request<{ selected: string[] }>('/dashboard/outsource-stats/settings', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
  getOutsourceStats: (params: WorkbenchStatsQueryParams = {}) => {
    const search = new URLSearchParams();
    appendWorkbenchStatsQuery(search, params);
    const qs = search.toString();
    return request<OutsourceStatsResponse | null>(`/dashboard/outsource-stats${qs ? `?${qs}` : ''}`);
  },
  getReworkStatsSettings: () => request<NodeStatsSettingsResponse>('/dashboard/rework-stats/settings'),
  saveReworkStatsSettings: (ids: string[]) =>
    request<{ selected: string[] }>('/dashboard/rework-stats/settings', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
  getReworkStats: (params: WorkbenchStatsQueryParams = {}) => {
    const search = new URLSearchParams();
    appendWorkbenchStatsQuery(search, params);
    const qs = search.toString();
    return request<ReworkStatsResponse | null>(`/dashboard/rework-stats${qs ? `?${qs}` : ''}`);
  },
  getProductEconomics: (params: WorkbenchStatsQueryParams = {}) => {
    const search = new URLSearchParams();
    appendWorkbenchStatsQuery(search, params);
    const qs = search.toString();
    return request<ProductEconomicsListResponse | null>(
      `/dashboard/product-economics${qs ? `?${qs}` : ''}`,
    );
  },
  getProductEconomicsDetail: (productId: string, materialCostMode?: 'consumable' | 'document_linked') => {
    const search = new URLSearchParams();
    if (materialCostMode) search.set('materialCostMode', materialCostMode);
    const qs = search.toString();
    return request<ProductEconomicsDetailResponse | null>(
      `/dashboard/product-economics/${encodeURIComponent(productId)}${qs ? `?${qs}` : ''}`,
    );
  },
  getMaterialPriceSettings: () =>
    request<MaterialPriceSettingsResponse>('/dashboard/material-purchase-prices/settings'),
  putMaterialPriceSettings: (materialPriceRule: MaterialPriceRule) =>
    request<{ materialPriceRule: MaterialPriceRule }>('/dashboard/material-purchase-prices/settings', {
      method: 'PUT',
      body: JSON.stringify({ materialPriceRule }),
    }),
  getMaterialPriceParentProducts: (params: { search?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.search?.trim()) search.set('search', params.search.trim());
    const qs = search.toString();
    return request<{ rows: MaterialPriceParentProductRow[] }>(
      `/dashboard/material-purchase-prices/parent-products${qs ? `?${qs}` : ''}`,
    );
  },
  getMaterialPriceBomMaterials: (parentId: string) =>
    request<MaterialPriceBomMaterialsResponse>(
      `/dashboard/material-purchase-prices/parent-products/${encodeURIComponent(parentId)}/materials`,
    ),
  patchParentMaterialPriceDefaultRule: (parentId: string, defaultRule: MaterialPriceRule | null) =>
    request<{ defaultRule: MaterialPriceRule | null }>(
      `/dashboard/material-purchase-prices/parent-products/${encodeURIComponent(parentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ defaultRule }),
      },
    ),
  patchBomMaterialPriceOverride: (
    parentId: string,
    materialId: string,
    rule: MaterialPriceRuleOverride,
  ) =>
    request<MaterialPriceBomMaterialRow>(
      `/dashboard/material-purchase-prices/parent-products/${encodeURIComponent(parentId)}/materials/${encodeURIComponent(materialId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ rule }),
      },
    ),
  getReportPriceParentProducts: (params: { search?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.search?.trim()) search.set('search', params.search.trim());
    const qs = search.toString();
    return request<{ rows: ProcessPriceParentProductRow[] }>(
      `/dashboard/report-prices/parent-products${qs ? `?${qs}` : ''}`,
    );
  },
  getReportPriceNodes: (parentId: string) =>
    request<ProcessPriceNodesResponse>(
      `/dashboard/report-prices/parent-products/${encodeURIComponent(parentId)}/nodes`,
    ),
  patchParentReportPriceDefaultRule: (parentId: string, defaultRule: MaterialPriceRule | null) =>
    request<{ defaultRule: MaterialPriceRule | null }>(
      `/dashboard/report-prices/parent-products/${encodeURIComponent(parentId)}`,
      { method: 'PATCH', body: JSON.stringify({ defaultRule }) },
    ),
  patchReportPriceNodeOverride: (
    parentId: string,
    nodeId: string,
    rule: MaterialPriceRuleOverride,
  ) =>
    request<ProcessPriceNodeRow>(
      `/dashboard/report-prices/parent-products/${encodeURIComponent(parentId)}/nodes/${encodeURIComponent(nodeId)}`,
      { method: 'PATCH', body: JSON.stringify({ rule }) },
    ),
  getOutsourcePriceParentProducts: (params: { search?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.search?.trim()) search.set('search', params.search.trim());
    const qs = search.toString();
    return request<{ rows: ProcessPriceParentProductRow[] }>(
      `/dashboard/outsource-prices/parent-products${qs ? `?${qs}` : ''}`,
    );
  },
  getOutsourcePriceNodes: (parentId: string) =>
    request<ProcessPriceNodesResponse>(
      `/dashboard/outsource-prices/parent-products/${encodeURIComponent(parentId)}/nodes`,
    ),
  patchParentOutsourcePriceDefaultRule: (parentId: string, defaultRule: MaterialPriceRule | null) =>
    request<{ defaultRule: MaterialPriceRule | null }>(
      `/dashboard/outsource-prices/parent-products/${encodeURIComponent(parentId)}`,
      { method: 'PATCH', body: JSON.stringify({ defaultRule }) },
    ),
  patchOutsourcePriceNodeOverride: (
    parentId: string,
    nodeId: string,
    rule: MaterialPriceRuleOverride,
  ) =>
    request<ProcessPriceNodeRow>(
      `/dashboard/outsource-prices/parent-products/${encodeURIComponent(parentId)}/nodes/${encodeURIComponent(nodeId)}`,
      { method: 'PATCH', body: JSON.stringify({ rule }) },
    ),
  getFinancePartnerStats: (params: WorkbenchStatsQueryParams = {}) => {
    const search = new URLSearchParams();
    appendWorkbenchStatsQuery(search, params);
    const qs = search.toString();
    return request<FinancePartnerStatsResponse | null>(
      `/dashboard/finance-partner-stats${qs ? `?${qs}` : ''}`,
    );
  },
  getNotifications: (params: { limit?: number } = {}) => {
    const qs = params.limit != null ? `?limit=${params.limit}` : '';
    return request<DashboardNotification[]>(`/dashboard/notifications${qs}`);
  },
  listPublishedMessages: () =>
    request<{ messages: PublishedMessageRow[] }>('/dashboard/messages'),
  publishMessage: (body: { title: string; body: string }) =>
    request<{ messages: PublishedMessageRow[] }>('/dashboard/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteMessage: (id: string) =>
    request<{ messages: PublishedMessageRow[] }>(`/dashboard/messages/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};
