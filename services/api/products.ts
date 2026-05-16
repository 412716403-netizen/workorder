import { request, crud, buildQs } from './_client';

// ── Products ──
export const products = {
  ...crud('/products'),
  listVariants: (productId: string) => request(`/products/${productId}/variants`),
  syncVariants: (productId: string, variants: unknown[]) =>
    request(`/products/${productId}/variants`, { method: 'POST', body: JSON.stringify({ variants }) }),
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
