import { request, crud } from './_client';

// ── Settings ──
export const settings = {
  categories: crud('/settings/categories'),
  partnerCategories: crud('/settings/partner-categories'),
  nodes: crud('/settings/nodes'),
  warehouses: crud('/settings/warehouses'),
  financeCategories: crud('/settings/finance-categories'),
  financeAccountTypes: crud('/settings/finance-account-types'),
  async getConfig() { return request<Record<string, unknown>>('/settings/config'); },
  async updateConfig(key: string, value: unknown) {
    return request(`/settings/config/${key}`, { method: 'PUT', body: JSON.stringify({ value }) });
  },
};
