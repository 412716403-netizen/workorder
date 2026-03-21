const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';

let accessToken: string | null = localStorage.getItem('accessToken');
let refreshToken: string | null = localStorage.getItem('refreshToken');

/** 登录成功后必须调用，否则 api 模块仍携带上一账号的 token */
export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export function isAuthenticated(): boolean {
  return !!accessToken;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  const rt = refreshToken || localStorage.getItem('refreshToken');
  if (!rt) return false;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  const token = accessToken || localStorage.getItem('accessToken');
  if (token) {
    accessToken = token;
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(url, { ...options, headers });
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
    setTokens(result.accessToken, result.refreshToken);
    return result;
  },

  async login(username: string, password: string) {
    const result = await request<LoginResult>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    });
    setTokens(result.accessToken, result.refreshToken);
    return result;
  },

  async logout() {
    if (refreshToken) {
      await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => {});
    }
    clearTokens();
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
    if (result.accessToken && result.refreshToken) {
      setTokens(result.accessToken, result.refreshToken);
    }
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
    setTokens(result.accessToken, result.refreshToken);
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
  /** null 表示永不到期 */
  accountExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 仅 role=admin 可调用 */
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
  list: () => request<Array<{ id: string; name: string; logo?: string; inviteCode: string; role: string; permissions: unknown; joinedAt: string }>>('/tenants'),
  create: (data: { name: string; logo?: string }) =>
    request<{ tenant: { id: string; name: string; inviteCode: string }; accessToken: string; refreshToken: string }>('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  select: async (id: string) => {
    const result = await request<{ tenantId: string; tenantName: string; tenantRole: string; permissions: string[]; accessToken: string; refreshToken: string }>(`/tenants/${id}/select`, { method: 'POST' });
    setTokens(result.accessToken, result.refreshToken);
    return result;
  },
  get: (id: string) => request<{ id: string; name: string; logo?: string; inviteCode: string }>(`/tenants/${id}`),
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
