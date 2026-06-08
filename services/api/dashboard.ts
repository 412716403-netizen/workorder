import { request } from './_client';
import type { WorkbenchConfig, FeaturePluginsConfig } from '../../types';

export interface WorkbenchResponse {
  effective: WorkbenchConfig;
}

export interface DashboardNotification {
  id: string;
  type: 'system' | 'announcement' | 'expiry_reminder';
  title: string;
  body: string;
  createdAt: string;
  href?: string;
  publisherName?: string;
}

export interface PublishedMessageRow {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  publisherName: string;
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
    monthBillCount: number;
    monthAmount: number;
    monthQuantity: number;
    totalBillCount: number;
    totalAmount: number;
    purchaseMonthCount: number;
    purchaseMonthAmount: number;
    lowStockCount: number;
    lowStockThreshold: number;
  };
  finance?: {
    totalReceipt: number;
    totalPayment: number;
    cashFlow: number;
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
  getShortcuts: () => request<ShortcutsResponse>('/dashboard/shortcuts'),
  saveShortcuts: (ids: string[]) =>
    request<{ selected: string[] }>('/dashboard/shortcuts', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
  getFeaturePlugins: () => request<FeaturePluginsConfig>('/dashboard/feature-plugins'),
  updateFeaturePlugins: (body: FeaturePluginsConfig) =>
    request<FeaturePluginsConfig>('/dashboard/feature-plugins', { method: 'PUT', body: JSON.stringify(body) }),
  getStats: (params: { days?: number } = {}) => {
    const qs = params.days != null ? `?days=${params.days}` : '';
    return request<DashboardStats>(`/dashboard/stats${qs}`);
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
