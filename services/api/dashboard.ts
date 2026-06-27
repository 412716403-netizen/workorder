import { request } from './_client';
import type { WorkbenchConfig, FeaturePluginsConfig } from '../../types';

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
  period: 'today' | 'yesterday' | 'month';
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
  period: 'today' | 'yesterday' | 'month';
  rows: DashboardOutsourceStatsRow[];
}

export interface ReworkStatsResponse {
  period: 'today' | 'yesterday' | 'month';
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
    period: 'today' | 'yesterday' | 'month';
    salesBillCount: number;
    salesAmount: number;
    salesQuantity: number;
    salesReturnQuantity: number;
  };
  salesOrder?: {
    period: 'today' | 'yesterday' | 'month';
    salesOrderCount: number;
    salesOrderAmount: number;
    salesOrderQuantity: number;
    salesOrderReduceQuantity: number;
  };
  finance?: {
    period: 'today' | 'yesterday' | 'month';
    receiptAmount: number;
    paymentAmount: number;
    cashFlow: number;
    receiptCount: number;
    paymentCount: number;
  };
}

export interface ShortcutsResponse {
  selected: string[];
  defaults: string[];
  hasCustom: boolean;
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
  getStats: (params: { days?: number; period?: 'today' | 'yesterday' | 'month' } = {}) => {
    const search = new URLSearchParams();
    if (params.days != null) search.set('days', String(params.days));
    if (params.period) search.set('period', params.period);
    const qs = search.toString();
    return request<DashboardStats>(`/dashboard/stats${qs ? `?${qs}` : ''}`);
  },
  getOrderStatsSettings: () => request<OrderStatsSettingsResponse>('/dashboard/order-stats/settings'),
  saveOrderStatsSettings: (ids: string[]) =>
    request<{ selected: string[] }>('/dashboard/order-stats/settings', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
  getOrderStats: (params: {
    period?: 'today' | 'yesterday' | 'month';
    includeNotStarted?: boolean;
  } = {}) => {
    const search = new URLSearchParams();
    if (params.period) search.set('period', params.period);
    if (params.includeNotStarted) search.set('includeNotStarted', '1');
    const qs = search.toString();
    return request<OrderStatsResponse | null>(`/dashboard/order-stats${qs ? `?${qs}` : ''}`);
  },
  getOutsourceStatsSettings: () => request<NodeStatsSettingsResponse>('/dashboard/outsource-stats/settings'),
  saveOutsourceStatsSettings: (ids: string[]) =>
    request<{ selected: string[] }>('/dashboard/outsource-stats/settings', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
  getOutsourceStats: (params: { period?: 'today' | 'yesterday' | 'month' } = {}) => {
    const search = new URLSearchParams();
    if (params.period) search.set('period', params.period);
    const qs = search.toString();
    return request<OutsourceStatsResponse | null>(`/dashboard/outsource-stats${qs ? `?${qs}` : ''}`);
  },
  getReworkStatsSettings: () => request<NodeStatsSettingsResponse>('/dashboard/rework-stats/settings'),
  saveReworkStatsSettings: (ids: string[]) =>
    request<{ selected: string[] }>('/dashboard/rework-stats/settings', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
  getReworkStats: (params: { period?: 'today' | 'yesterday' | 'month' } = {}) => {
    const search = new URLSearchParams();
    if (params.period) search.set('period', params.period);
    const qs = search.toString();
    return request<ReworkStatsResponse | null>(`/dashboard/rework-stats${qs ? `?${qs}` : ''}`);
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
