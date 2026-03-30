const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';

/** 避免防火墙丢包或地址错误时 fetch 长期挂起，登录按钮一直转圈 */
const REQUEST_TIMEOUT_MS = 25_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('请求超时或无法连接服务器，请检查 API 地址、安全组是否放行端口、后端是否已启动');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Token 存储在 httpOnly Cookie 中由服务端管理。
 * 内存变量仅作为兼容回退（例如 SSR 或无 Cookie 环境）。
 */
let memoryAccessToken: string | null = null;

export function setTokens(access: string, _refresh?: string) {
  memoryAccessToken = access;
}

export function clearTokens() {
  memoryAccessToken = null;
  localStorage.removeItem('isLoggedIn');
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('isLoggedIn');
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.accessToken) memoryAccessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** 依赖 httpOnly refresh Cookie 换新 access（与 401 触发的刷新共用去重逻辑）。用于长时间空闲、切回页签后避免首请求失败。 */
export async function refreshSessionSilently(): Promise<boolean> {
  return tryRefresh();
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (memoryAccessToken) {
    headers['Authorization'] = `Bearer ${memoryAccessToken}`;
  }

  let res = await fetchWithTimeout(url, { ...options, headers, credentials: 'include' });

  if (res.status === 401 || res.status === 403) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      if (memoryAccessToken) {
        headers['Authorization'] = `Bearer ${memoryAccessToken}`;
      }
      res = await fetchWithTimeout(url, { ...options, headers, credentials: 'include' });
    } else if (localStorage.getItem('isLoggedIn')) {
      clearTokens();
      localStorage.removeItem('currentUser');
      localStorage.removeItem('tenantCtx');
      localStorage.removeItem('userTenants');
      window.location.replace('/');
      return new Promise<T>(() => {});
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type TenantInfo = {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  status?: string;
  expiresAt?: string | null;
};

export type LoginResult = {
  user: MeUser;
  accessToken: string;
  refreshToken: string;
  isEnterprise: boolean;
  tenants: TenantInfo[];
  tenantId?: string | null;
};

export type MeUser = {
  id: string;
  username: string;
  phone?: string | null;
  email: string | null;
  displayName: string | null;
  role: string;
  status: string;
  isEnterprise?: boolean;
  accountExpiresAt: string | null;
  tenants?: TenantInfo[];
};

// ── Auth ──
export const auth = {
  async register(data: { phone: string; password: string; displayName?: string }) {
    const result = await request<LoginResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (result.accessToken) memoryAccessToken = result.accessToken;
    return result;
  },

  async login(username: string, password: string) {
    const result = await request<LoginResult>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    });
    if (result.accessToken) memoryAccessToken = result.accessToken;
    return result;
  },

  async logout() {
    await request('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
    memoryAccessToken = null;
  },

  async me() {
    return request<MeUser>('/auth/me');
  },

  async updateProfile(data: {
    displayName?: string;
    oldPassword?: string;
    newPassword?: string;
  }) {
    const result = await request<{
      user: MeUser;
      accessToken?: string;
      refreshToken?: string;
    }>('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
    if (result.accessToken) memoryAccessToken = result.accessToken;
    return result;
  },

  async phoneChangeSendCodeOld(oldPhone: string) {
    return request<{ message: string; devCode?: string }>('/auth/phone-change/send-code-old', {
      method: 'POST',
      body: JSON.stringify({ oldPhone }),
    });
  },

  async phoneChangeVerifyOldCode(oldPhone: string, code: string) {
    return request<{ phaseToken: string }>('/auth/phone-change/verify-old-code', {
      method: 'POST',
      body: JSON.stringify({ oldPhone, code }),
    });
  },

  async phoneChangeSendCodeNew(phaseToken: string, newPhone: string) {
    return request<{ message: string; devCode?: string }>('/auth/phone-change/send-code-new', {
      method: 'POST',
      body: JSON.stringify({ phaseToken, newPhone }),
    });
  },

  async phoneChangeComplete(phaseToken: string, newPhone: string, code: string) {
    const result = await request<{
      user: MeUser;
      accessToken: string;
      refreshToken: string;
    }>('/auth/phone-change/complete', {
      method: 'POST',
      body: JSON.stringify({ phaseToken, newPhone, code }),
    });
    if (result.accessToken) memoryAccessToken = result.accessToken;
    return result;
  },
};

export type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: string;
  status: string;
  accountExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const adminUsers = {
  list: () => request<AdminUserRow[]>('/admin/users'),
  create: (data: {
    username: string;
    password: string;
    displayName?: string;
    email?: string | null;
    role?: 'admin' | 'user';
    accountExpiresAt?: string | null;
  }) =>
    request<AdminUserRow>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: {
      displayName?: string;
      email?: string | null;
      role?: 'admin' | 'user';
      status?: 'active' | 'disabled';
      password?: string;
      accountExpiresAt?: string | null;
    },
  ) =>
    request<AdminUserRow>(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
};

export type AdminTenantRow = {
  id: string;
  name: string;
  status: string;
  expiresAt: string | null;
  memberCount: number;
  owner: { id: string; username: string; displayName: string | null; phone: string | null } | null;
  createdAt: string;
};

export const adminTenants = {
  list: (params?: { status?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request<AdminTenantRow[]>(`/admin/tenants${qs}`);
  },
  update: (id: string, data: { expiresAt?: string | null; status?: string }) =>
    request<{ id: string; name: string; status: string; expiresAt: string | null }>(`/admin/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ── Generic CRUD helpers ──
function crud<T = unknown>(base: string) {
  return {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<T[]>(`${base}${qs}`);
    },
    get: (id: string) => request<T>(`${base}/${id}`),
    create: (data: Partial<T>) => request<T>(base, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<T>) => request<T>(`${base}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`${base}/${id}`, { method: 'DELETE' }),
  };
}

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

// ── Master Data ──
export const partners = crud('/master/partners');
export const workers = crud('/master/workers');
export const equipment = crud('/master/equipment');
export const dictionaries = {
  list: () => request<{ colors: unknown[]; sizes: unknown[]; units: unknown[] }>('/master/dictionaries'),
  create: (data: unknown) => request('/master/dictionaries', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/master/dictionaries/${id}`, { method: 'DELETE' }),
};

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
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/products/boms/all${qs}`);
  },
  get: (id: string) => request(`/products/boms/${id}`),
  create: (data: unknown) => request('/products/boms', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) => request(`/products/boms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/products/boms/${id}`, { method: 'DELETE' }),
};

// ── Plans ──
export const plans = {
  ...crud('/plans'),
  split: (id: string, data: unknown) => request(`/plans/${id}/split`, { method: 'POST', body: JSON.stringify(data) }),
  convert: (id: string) => request(`/plans/${id}/convert`, { method: 'POST' }),
  createSubPlans: (id: string, subPlans: unknown[]) =>
    request(`/plans/${id}/sub-plans`, { method: 'POST', body: JSON.stringify({ subPlans }) }),
};

// ── Orders ──
export const orders = {
  ...crud('/orders'),
  createReport: (orderId: string, milestoneId: string, data: unknown) =>
    request(`/orders/${orderId}/milestones/${milestoneId}/reports`, { method: 'POST', body: JSON.stringify(data) }),
  updateReport: (orderId: string, milestoneId: string, reportId: string, data: unknown) =>
    request(`/orders/${orderId}/milestones/${milestoneId}/reports/${reportId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReport: (orderId: string, milestoneId: string, reportId: string) =>
    request(`/orders/${orderId}/milestones/${milestoneId}/reports/${reportId}`, { method: 'DELETE' }),
  getReportable: (orderId: string) => request(`/orders/${orderId}/reportable`),
  createProductReport: (data: unknown) =>
    request('/orders/product-progress/report', { method: 'POST', body: JSON.stringify(data) }),
  updateProductReport: (reportId: string, data: unknown) =>
    request(`/orders/product-progress/report/${reportId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProductReport: (reportId: string) =>
    request(`/orders/product-progress/report/${reportId}`, { method: 'DELETE' }),
  listProductProgress: () => request<unknown[]>('/orders/product-progress'),
};

// ── Production ──
export const production = {
  ...crud('/production/records'),
  getDefectiveRework: () => request('/production/defective-rework'),
};

// ── PSI ──
export const psi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/psi/records${qs}`);
  },
  create: (data: unknown) => request('/psi/records', { method: 'POST', body: JSON.stringify(data) }),
  createBatch: (records: unknown[]) => request('/psi/records/batch', { method: 'POST', body: JSON.stringify({ records }) }),
  update: (id: string, data: unknown) => request(`/psi/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  replace: (deleteIds: string[], newRecords: unknown[]) =>
    request('/psi/records/replace', { method: 'PUT', body: JSON.stringify({ deleteIds, newRecords }) }),
  delete: (id: string) => request(`/psi/records/${id}`, { method: 'DELETE' }),
  deleteBatch: (ids: string[]) => request('/psi/records', { method: 'DELETE', body: JSON.stringify({ ids }) }),
  getStock: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/psi/stock${qs}`);
  },
};

// ── Finance ──
export const finance = crud('/finance/records');

// ── Dashboard ──
export const dashboard = {
  getStats: () => request('/dashboard/stats'),
};

// ── Roles ──
export type RoleRow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { members: number };
};

export const roles = {
  list: () => request<RoleRow[]>('/roles'),
  create: (data: { name: string; description?: string; permissions: string[] }) =>
    request<RoleRow>('/roles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<RoleRow>(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),
};

// ── Tenants ──
export const tenants = {
  list: () => request<Array<{ id: string; name: string; logo?: string; inviteCode: string; status?: string; expiresAt?: string | null; role: string; permissions: unknown; joinedAt: string }>>('/tenants'),
  create: (data: { name: string; logo?: string }) =>
    request<{ tenant: { id: string; name: string; status: string }; message: string }>('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  select: async (id: string) => {
    const result = await request<{ tenantId: string; tenantName: string; tenantRole: string; permissions: string[]; expiresAt?: string | null; accessToken: string; refreshToken: string }>(`/tenants/${id}/select`, { method: 'POST' });
    if (result.accessToken) memoryAccessToken = result.accessToken;
    return result;
  },
  get: (id: string) => request<{ id: string; name: string; logo?: string; inviteCode: string; expiresAt?: string | null }>(`/tenants/${id}`),
  update: (id: string, data: { name?: string; logo?: string }) =>
    request(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  lookup: (code: string) => request<{ id: string; name: string; logo?: string; memberCount: number }>(`/tenants/lookup?code=${encodeURIComponent(code)}`),
  apply: (id: string, data?: { message?: string }) =>
    request(`/tenants/${id}/apply`, { method: 'POST', body: JSON.stringify(data || {}) }),
  myApplications: () => request<Array<{ id: string; tenantId: string; status: string; tenant: { id: string; name: string; logo?: string }; createdAt: string }>>('/tenants/my-applications'),
  getMembers: (id: string) =>
    request<Array<{ id: string; userId: string; username: string; phone?: string; displayName?: string; role: string; permissions: unknown; roleId?: string | null; roleName?: string | null; assignedMilestoneIds?: string[]; joinedAt: string }>>(`/tenants/${id}/members`),
  getReportableMembers: (id: string) =>
    request<Array<{ id: string; name: string; groupName: string; role: string; status: string; skills: string[]; assignedMilestoneIds: string[] }>>(`/tenants/${id}/reportable-members`),
  updateMemberRole: (id: string, uid: string, data: { role?: string; roleId?: string | null }) =>
    request(`/tenants/${id}/members/${uid}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateMemberPerms: (id: string, uid: string, data: { permissions: string[] }) =>
    request(`/tenants/${id}/members/${uid}/perms`, { method: 'PUT', body: JSON.stringify(data) }),
  updateMemberMilestones: (id: string, uid: string, data: { assignedMilestoneIds: string[] }) =>
    request(`/tenants/${id}/members/${uid}/milestones`, { method: 'PUT', body: JSON.stringify(data) }),
  removeMember: (id: string, uid: string) =>
    request(`/tenants/${id}/members/${uid}`, { method: 'DELETE' }),
  getApplications: (id: string) =>
    request<Array<{ id: string; userId: string; status: string; message?: string; user: { id: string; username: string; phone?: string; displayName?: string }; createdAt: string }>>(`/tenants/${id}/applications`),
  reviewApplication: (id: string, appId: string, data: { action: 'APPROVED' | 'REJECTED'; role?: string; permissions?: string[] }) =>
    request(`/tenants/${id}/applications/${appId}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ── Collaboration (企业间协作) ──
export const collaboration = {
  createCollaboration: (data: { inviteCode: string }) =>
    request<any>('/collaboration/collaborations', { method: 'POST', body: JSON.stringify(data) }),
  listCollaborations: () =>
    request<any[]>('/collaboration/collaborations'),

  syncDispatch: (data: { recordIds: string[]; collaborationTenantId: string; outsourceRouteId?: string }) =>
    request<{ dispatches: { transferId: string; dispatchId: string; productName: string }[] }>(
      '/collaboration/subcontract-transfers/sync-dispatch',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  listTransfers: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/collaboration/subcontract-transfers${qs}`);
  },
  getTransfer: (id: string) =>
    request<any>(`/collaboration/subcontract-transfers/${id}`),

  acceptTransfer: (id: string, data: any) =>
    request<any>(`/collaboration/subcontract-transfers/${id}/accept`, { method: 'POST', body: JSON.stringify(data) }),
  forwardTransfer: (id: string, data: { items: Array<{ colorName: string | null; sizeName: string | null; quantity: number }>; note?: string; warehouseId?: string }) =>
    request<any>(`/collaboration/subcontract-transfers/${id}/forward`, { method: 'POST', body: JSON.stringify(data) }),
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

  listOutsourceRoutes: () =>
    request<any[]>('/collaboration/outsource-routes'),
  createOutsourceRoute: (data: { name: string; steps: any[] }) =>
    request<any>('/collaboration/outsource-routes', { method: 'POST', body: JSON.stringify(data) }),
  updateOutsourceRoute: (id: string, data: { name?: string; steps?: any[] }) =>
    request<any>(`/collaboration/outsource-routes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOutsourceRoute: (id: string) =>
    request(`/collaboration/outsource-routes/${id}`, { method: 'DELETE' }),

  listProductMaps: (collaborationId?: string) => {
    const qs = collaborationId ? `?collaborationId=${collaborationId}` : '';
    return request<any[]>(`/collaboration/collaboration-product-maps${qs}`);
  },
  updateProductMap: (id: string, data: any) =>
    request<any>(`/collaboration/collaboration-product-maps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProductMap: (id: string) =>
    request(`/collaboration/collaboration-product-maps/${id}`, { method: 'DELETE' }),
};
