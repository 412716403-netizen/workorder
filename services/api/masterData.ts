import { request, crud } from './_client';

// ── Master Data ──
export const partners = {
  ...crud('/master/partners'),
  import: (data: { categoryId: string; partners: unknown[] }) =>
    request('/master/partners/import', { method: 'POST', body: JSON.stringify(data) }),
};
export const workers = crud('/master/workers');
export const equipment = crud('/master/equipment');
export const dictionaries = {
  list: () => request<{ colors: unknown[]; sizes: unknown[]; units: unknown[] }>('/master/dictionaries?all=true'),
  create: (data: unknown) => request('/master/dictionaries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request(`/master/dictionaries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/master/dictionaries/${id}`, { method: 'DELETE' }),
};
