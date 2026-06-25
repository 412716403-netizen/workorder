import { request, crud } from './_client';

// ── Settings ──
export const settings = {
  categories: {
    ...crud('/settings/categories'),
    usage() { return request<{ usedIds: string[] }>('/settings/categories/usage'); },
  },
  partnerCategories: {
    ...crud('/settings/partner-categories'),
    usage() { return request<{ usedIds: string[] }>('/settings/partner-categories/usage'); },
  },
  nodes: {
    ...crud('/settings/nodes'),
    reorder(orderedIds: string[]) {
      return request<unknown>('/settings/nodes/reorder', {
        method: 'PUT',
        body: JSON.stringify({ orderedIds }),
      });
    },
  },
  warehouses: {
    ...crud('/settings/warehouses'),
    usage() { return request<{ usedIds: string[] }>('/settings/warehouses/usage'); },
  },
  financeCategories: {
    ...crud('/settings/finance-categories'),
    usage() { return request<{ usedIds: string[] }>('/settings/finance-categories/usage'); },
  },
  financeAccountTypes: crud('/settings/finance-account-types'),
  async getConfig() { return request<Record<string, unknown>>('/settings/config'); },
  async updateConfig(key: string, value: unknown) {
    return request(`/settings/config/${key}`, { method: 'PUT', body: JSON.stringify({ value }) });
  },
};
