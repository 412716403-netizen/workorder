import type { CollabAcceptTransferBody } from '../types';

/** 生产或未走 Vite 时可用 VITE_API_BASE；开发默认走同源 /api，由 Vite 代理到本机 3001（支持局域网 IP 访问前端） */
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV ? '/api' : 'http://localhost:3001/api');

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
 * 另将 access 同步到 sessionStorage：F5 后内存清空时仍能带 Authorization，减轻跨子域 Cookie 未带上时的误登出。
 */
const ACCESS_SESSION_KEY = 'st_api_access_v1';

let memoryAccessToken: string | null = null;

function persistAccessToken(access: string | null) {
  memoryAccessToken = access;
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (access) sessionStorage.setItem(ACCESS_SESSION_KEY, access);
    else sessionStorage.removeItem(ACCESS_SESSION_KEY);
  } catch {
    /* 无痕/禁用存储 */
  }
}

function restoreAccessFromSessionIfLoggedIn() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (!localStorage.getItem('isLoggedIn')) return;
    const s = sessionStorage.getItem(ACCESS_SESSION_KEY);
    if (s) memoryAccessToken = s;
  } catch {
    /* */
  }
}

restoreAccessFromSessionIfLoggedIn();

export function setTokens(access: string, _refresh?: string) {
  persistAccessToken(access);
}

export function clearTokens() {
  persistAccessToken(null);
  localStorage.removeItem('isLoggedIn');
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('isLoggedIn');
}

/* ── JWT 过期检测（仅解析 payload，不做签名验证） ── */

function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * 距 access JWT 过期不足该秒数则先发 /auth/refresh 续期。
 * 后端默认 JWT_EXPIRES_IN≈15m；原先 120s 窗口偏紧，网络或服务器短暂抖动时易在未续期前拿到 401 被当作掉线。
 */
const REFRESH_MARGIN_S = 300;

const REFRESH_RETRYABLE_HTTP = new Set([502, 503, 504]);
/**
 * dev 期 tsx watch 重启后端一般要 10~25s 才重新监听 3001，期间所有 /api/* 都是
 * ECONNREFUSED；旧逻辑 3 次 × 350ms 共 ~1s 就放弃，把这种瞬时网络错当成 refresh 真失败，
 * 进而把用户踢回登录页（典型「保存后端代码就掉线」的现象）。
 * 这里把重试拉到 ~30s 总窗口，并保留指数 backoff，足以覆盖后端热重启。
 */
const REFRESH_MAX_ATTEMPTS = 8;
const REFRESH_BACKOFF_MS = [500, 1000, 2000, 3000, 4000, 5000, 6000];

/**
 * `tryRefresh` 的结果：
 * - `ok`：拿到新的 access token；
 * - `rejected`：服务器明确拒绝（401/403/refresh 缺失等），登录态真的失效；
 * - `network_fail`：网络抖动/后端短暂不可用/超时——**不应该**被解释为登录态失效。
 */
type RefreshResult = 'ok' | 'rejected' | 'network_fail';

function isAccessTokenExpiringSoon(): boolean {
  if (!memoryAccessToken) return true;
  const exp = decodeJwtExp(memoryAccessToken);
  if (!exp) return true;
  return exp - Date.now() / 1000 < REFRESH_MARGIN_S;
}

/* ── Token refresh ── */

let refreshPromise: Promise<RefreshResult> | null = null;

async function tryRefreshDetailed(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      for (let attempt = 1; attempt <= REFRESH_MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({}),
          });
          if (res.status === 401 || res.status === 403) {
            console.warn('[auth] refresh rejected', res.status);
            return 'rejected';
          }
          if (!res.ok) {
            const retryable = REFRESH_RETRYABLE_HTTP.has(res.status);
            if (retryable && attempt < REFRESH_MAX_ATTEMPTS) {
              await new Promise(r => setTimeout(r, REFRESH_BACKOFF_MS[Math.min(attempt - 1, REFRESH_BACKOFF_MS.length - 1)]));
              continue;
            }
            console.warn('[auth] refresh failed, status', res.status);
            return retryable ? 'network_fail' : 'rejected';
          }
          const data = await res.json();
          if (data.accessToken) {
            persistAccessToken(data.accessToken);
            return 'ok';
          }
          console.warn('[auth] refresh response missing accessToken');
          return 'rejected';
        } catch (e) {
          if (attempt < REFRESH_MAX_ATTEMPTS) {
            console.warn('[auth] refresh attempt', attempt, 'network/timeout, retrying', e);
            await new Promise(r => setTimeout(r, REFRESH_BACKOFF_MS[Math.min(attempt - 1, REFRESH_BACKOFF_MS.length - 1)]));
            continue;
          }
          console.warn('[auth] refresh error (network)', e);
          return 'network_fail';
        }
      }
      return 'network_fail';
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function tryRefresh(): Promise<boolean> {
  return (await tryRefreshDetailed()) === 'ok';
}

/** 依赖 httpOnly refresh Cookie 换新 access（与 401 触发的刷新共用去重逻辑）。用于长时间空闲、切回页签后避免首请求失败。 */
export async function refreshSessionSilently(): Promise<boolean> {
  return tryRefresh();
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;

  /* ── 请求前主动续期：不依赖定时器，每次调用都检查令牌剩余时间 ── */
  if (localStorage.getItem('isLoggedIn') && isAccessTokenExpiringSoon()) {
    await tryRefresh();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (memoryAccessToken) {
    headers['Authorization'] = `Bearer ${memoryAccessToken}`;
  }

  let res = await fetchWithTimeout(url, {
    ...options,
    headers,
    credentials: 'include',
    cache: options.cache ?? 'no-store',
  });

  /* 仅 401 触发换票：403 多为权限/业务（如无权、企业到期），不应与「登录态失效」混同 */
  if (res.status === 401) {
    const refreshResult = await tryRefreshDetailed();
    if (refreshResult === 'ok') {
      if (memoryAccessToken) {
        headers['Authorization'] = `Bearer ${memoryAccessToken}`;
      }
      res = await fetchWithTimeout(url, {
        ...options,
        headers,
        credentials: 'include',
        cache: options.cache ?? 'no-store',
      });
    } else if (refreshResult === 'rejected' && localStorage.getItem('isLoggedIn')) {
      /**
       * 仅当服务器**明确**拒绝（401/403/缺 refresh）时才登出。
       * 网络失败（dev 期 tsx 热重启 / 网络抖动）保持登录态、抛错让上层提示重试即可，
       * 不再因为后端短暂不可用就把用户踢回登录页。
       */
      console.warn('[auth] refresh rejected after 401 — logging out');
      clearTokens();
      localStorage.removeItem('currentUser');
      localStorage.removeItem('tenantCtx');
      localStorage.removeItem('userTenants');
      window.location.replace('/');
      return new Promise<T>(() => {});
    } else if (refreshResult === 'network_fail') {
      console.warn('[auth] refresh network failure on 401 — keep session, surface error');
      throw new Error('网络连接暂不可用，请稍后重试（后端可能正在重启或网络抖动）');
    }
  }

  if (!res.ok) {
    const rawText = await res.text().catch(() => '');
    let errMsg: string | undefined;
    try {
      const j = rawText ? (JSON.parse(rawText) as { error?: string; message?: string }) : {};
      if (typeof j.error === 'string') errMsg = j.error;
      if (!errMsg && typeof j.message === 'string') errMsg = j.message;
    } catch {
      errMsg = rawText.trim() || undefined;
    }
    /**
     * 仅起 Vite、未起后端时：代理 /api → 127.0.0.1:3001 会得到 500 + text/plain 且常为空正文，
     * 旧逻辑用 res.json 失败后退回 statusText，Toast 只显示「Internal Server Error」误导用户。
     */
    const viteProxyBackendDown =
      import.meta.env.DEV &&
      res.status === 500 &&
      (!rawText.trim() || errMsg === 'Internal Server Error' || /ECONNREFUSED/i.test(rawText));
    if (viteProxyBackendDown) {
      errMsg =
        '无法连接 API（多为后端未在 3001 运行）。请在仓库根目录执行 npm run dev:all，或在 backend 目录执行 npm run dev。';
    } else {
      errMsg = errMsg || res.statusText || `HTTP ${res.status}`;
    }
    throw new Error(errMsg);
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
  /** 企业是否启用设备模块；缺省为开 */
  equipmentFeaturesEnabled?: boolean;
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
    if (result.accessToken) persistAccessToken(result.accessToken);
    return result;
  },

  async login(username: string, password: string) {
    const result = await request<LoginResult>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    });
    if (result.accessToken) persistAccessToken(result.accessToken);
    return result;
  },

  async logout() {
    await request('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
    persistAccessToken(null);
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
    if (result.accessToken) persistAccessToken(result.accessToken);
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
    if (result.accessToken) persistAccessToken(result.accessToken);
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
  list: () => request<AdminUserRow[]>('/admin/users?all=true'),
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
  equipmentFeaturesEnabled?: boolean;
  memberCount: number;
  owner: { id: string; username: string; displayName: string | null; phone: string | null } | null;
  createdAt: string;
};

export const adminTenants = {
  list: (params?: { status?: string }) => {
    const p: Record<string, string> = { all: 'true' };
    if (params?.status) p.status = params.status;
    return request<AdminTenantRow[]>(`/admin/tenants?${new URLSearchParams(p).toString()}`);
  },
  update: (
    id: string,
    data: { expiresAt?: string | null; status?: string; equipmentModuleEnabled?: boolean },
  ) =>
    request<{ id: string; name: string; status: string; expiresAt: string | null; equipmentFeaturesEnabled?: boolean }>(
      `/admin/tenants/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    ),
};

// ── Pagination types ──
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  updatedAfter?: string;
  [key: string]: string | number | undefined;
}

function buildQs(params?: PaginationParams | Record<string, string>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

// ── Generic CRUD helpers ──
function crud<T = unknown>(base: string) {
  return {
    list: (params?: PaginationParams | Record<string, string>) => {
      const mergedEntries: Record<string, string> = {
        all: 'true',
        ...(params
          ? Object.fromEntries(
              Object.entries(params)
                .filter(([, v]) => v != null && v !== '')
                .map(([k, v]) => [k, String(v)]),
            )
          : {}),
      };
      const qs = new URLSearchParams(mergedEntries).toString();
      return request<T[]>(`${base}?${qs}`);
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
  list: () => request<{ colors: unknown[]; sizes: unknown[]; units: unknown[] }>('/master/dictionaries?all=true'),
  create: (data: unknown) => request('/master/dictionaries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request(`/master/dictionaries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
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
    const qs = buildQs({ all: 'true', ...(params ?? {}) });
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
  /** 分页接口，必须返回 { data, total, page, pageSize }；不要叠 all=true，否则后端走全量分支返回数组导致 .data undefined */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<any>>(`/plans${buildQs(params)}`),
  split: (id: string, data: unknown) => request(`/plans/${id}/split`, { method: 'POST', body: JSON.stringify(data) }),
  convert: (id: string) => request(`/plans/${id}/convert`, { method: 'POST' }),
  createSubPlans: (id: string, subPlans: unknown[]) =>
    request(`/plans/${id}/sub-plans`, { method: 'POST', body: JSON.stringify({ subPlans }) }),
};

// ── Orders ──
export const orders = {
  ...crud('/orders'),
  /** 分页接口，必须返回 { data, total, page, pageSize }；不要叠 all=true */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<any>>(`/orders${buildQs(params)}`),
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
  listProductProgress: () => request<unknown[]>('/orders/product-progress?all=true'),
  /** Phase 3.E：报工流水弹窗按日期窗口窄拉，避免遍历全部工单内嵌 reports */
  listReportHistory: (params: {
    startDate?: string;
    endDate?: string;
    orderIds?: string;
    productIds?: string;
    search?: string;
    productionLinkMode?: 'order' | 'product';
  }) =>
    request<{ orderReports: any[]; productReports: any[] }>(`/orders/report-history${buildQs(params)}`),
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

export const production = {
  ...crud('/production/records'),
  /**
   * 批量写入；后端会在"全部记录同 type、全部缺省 docNo、且 OUTSOURCE 时 partner 一致"的情况下，
   * **共享分配**一个 docNo 给整批；其它情况退化为逐条 createRecord 的语义。
   * 用此接口避免前端基于 stale 缓存自算 docNo 造成的串号 / 加合（典型："两次批量入库共用 RK20260512-0004"）。
   */
  createBatch: (records: unknown[]) =>
    request<unknown[]>('/production/records/batch', { method: 'POST', body: JSON.stringify({ records }) }),
  /** 分页接口，必须返回 { data, total, page, pageSize }；不要叠 all=true */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<any>>(`/production/records${buildQs(params)}`),
  /** Phase 3.C：分页友好的列表接口，新视图应优先使用，不再拉全量 */
  listPage: (params: PaginationParams & ProductionFilter & Record<string, string | number | undefined> = {}) =>
    request<PaginatedResponse<any>>(`/production/records${buildQs(params)}`),
  /** Phase 3.C：后端聚合接口，看板/报表类视图直接消费聚合结果 */
  summary: (params: ProductionFilter & { topWorkers?: number; topPartners?: number } = {}) =>
    request<ProductionSummary>(`/production/summary${buildQs(params as Record<string, string | number | undefined>)}`),
  getDefectiveRework: () => request('/production/defective-rework'),
};

// ── PSI ──
export interface StockSnapshotBucket {
  productId: string;
  warehouseId: string;
  variantId?: string;
  batchNo?: string;
  psiIn: number;
  psiOut: number;
  transferIn: number;
  transferOut: number;
  /** Phase 3.B：仅 byVariant 桶有；若变体下存在盘点记录，等价于前端 getVariantDisplayQty 结果 */
  displayQty?: number;
  prodIn: number;
  prodOut: number;
  stocktakeAdj: number;
}

export const psi = {
  list: (params?: PaginationParams | Record<string, string>) => {
    return request(`/psi/records${buildQs({ all: 'true', ...(params ?? {}) })}`);
  },
  /** 分页接口，必须返回 { data, total, page, pageSize }；不要叠 all=true */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<any>>(`/psi/records${buildQs(params)}`),
  create: (data: unknown) => request('/psi/records', { method: 'POST', body: JSON.stringify(data) }),
  createBatch: (records: unknown[]) => request('/psi/records/batch', { method: 'POST', body: JSON.stringify({ records }) }),
  update: (id: string, data: unknown) => request(`/psi/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  replace: (deleteIds: string[], newRecords: unknown[]) =>
    request('/psi/records/replace', { method: 'PUT', body: JSON.stringify({ deleteIds, newRecords }) }),
  delete: (id: string) => request(`/psi/records/${id}`, { method: 'DELETE' }),
  deleteBatch: (ids: string[]) => request('/psi/records', { method: 'DELETE', body: JSON.stringify({ ids }) }),
  /** Phase 3.B：库存快照，替代前端 usePsiStockIndex 全量遍历；支持按 productId/warehouseId 缩窄。 */
  getStockSnapshot: (params?: { productId?: string; warehouseId?: string }) =>
    request<{
      byWarehouse: StockSnapshotBucket[];
      byVariant: StockSnapshotBucket[];
      byBatch: StockSnapshotBucket[];
    }>(`/psi/stock-snapshot${buildQs(params as Record<string, string | number | undefined> | undefined)}`),
  getStock: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/psi/stock${qs}`);
  },
  /** 按批次汇总某产品在某仓库的可用库存（仅 batchNo 非空流水） */
  getStockBatches: (params: Record<string, string>) => {
    const qs = '?' + new URLSearchParams(params).toString();
    return request<Array<{ batchNo: string; stock: number }>>(`/psi/stock/batches${qs}`);
  },
  /**
   * Phase 3.D follow-up：计划详情面板"计划相关 PSI"窄查接口。
   * 返回：{ purchaseOrders: PSI[], purchaseBills: PSI[] }——前端按需自己算 receivedByOrderLine。
   */
  planRelated: (params: { planId: string; planNumbers?: string[] }) =>
    request<{ purchaseOrders: any[]; purchaseBills: any[] }>(
      `/psi/plan-related${buildQs({
        planId: params.planId,
        planNumbers: (params.planNumbers ?? []).join(','),
      })}`,
    ),
  /**
   * Phase 3.D follow-up：按合作单位预生成 PSI 单号。
   * - prefix 必填；psiType 必填（PURCHASE_ORDER / PURCHASE_BILL / SALES_ORDER / SALES_BILL）。
   * - 后端会按 (partnerId 或 partnerName) 精确匹配；legacyPrefixes 可叠加旧前缀（如 SB → XS 改前缀场景）。
   */
  nextDocNumber: (params: {
    prefix: string;
    psiType: string;
    partnerId?: string;
    partnerName?: string;
    legacyPrefixes?: string[];
  }) =>
    request<{ docNumber: string; segment: string; seq: number }>(
      `/psi/next-doc-number${buildQs({
        prefix: params.prefix,
        psiType: params.psiType,
        partnerId: params.partnerId,
        partnerName: params.partnerName,
        legacyPrefixes: (params.legacyPrefixes ?? []).join(','),
      })}`,
    ),
  /** Phase 3.D follow-up：批量 (partner, product) → 上次采购单价 */
  lastPurchasePrices: (items: Array<{ partnerId?: string; partnerName?: string; productId: string }>) =>
    request<Array<{ price: number | null }>>(`/psi/last-purchase-prices`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
};

// ── Finance ──
export interface FinanceFilter {
  type?: string;
  status?: string;
  categoryId?: string;
  partner?: string;
  partnerId?: string;
  operator?: string;
  workerId?: string;
  productId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface FinanceSummary {
  byType: Array<{ type: string; amount: number; count: number }>;
  byStatus: Array<{ type: string; status: string; amount: number; count: number }>;
  byCategory: Array<{ categoryId: string | null; amount: number; count: number }>;
  topPartners: Array<{ partner: string | null; amount: number }>;
}

export const finance = {
  ...crud('/finance/records'),
  /** Phase 3.A：分页 + 过滤接口，新业务页应优先用这个，避免一次拉全量 */
  listPage: (params: PaginationParams & FinanceFilter & Record<string, string | number | undefined> = {}) =>
    request<PaginatedResponse<any>>(`/finance/records${buildQs(params)}`),
  /** 兼容老叫法，与 listPage 等价；保持向后兼容期不删除 */
  listPaginated: (params: PaginationParams | Record<string, string>) =>
    request<PaginatedResponse<any>>(`/finance/records${buildQs(params)}`),
  /** Phase 3.A：后端聚合接口，对账类视图改用此接口，不再前端遍历全量 */
  summary: (params: FinanceFilter & { topPartners?: number } = {}) =>
    request<FinanceSummary>(`/finance/summary${buildQs(params as Record<string, string | number | undefined>)}`),
  /**
   * Phase 3.D follow-up：销售单打印「上次结余」窄查接口。
   * - partnerName 为必填（财务记录按 name 精确匹配；后端 PSI 也按 (partnerId or partnerName) OR 匹配）。
   * - before：ISO 时间字符串，截止时刻；返回严格早于此时刻的应收余额。
   * - excludeSalesBillDocNumber：编辑销售单时排除自身。
   */
  partnerReceivable: (params: {
    partnerName: string;
    partnerId?: string;
    before: string;
    excludeSalesBillDocNumber?: string;
  }) =>
    request<{ previousBalance: number; anchorTimeMs: number }>(
      `/finance/partner-receivable${buildQs({
        partnerName: params.partnerName,
        partnerId: params.partnerId,
        before: params.before,
        excludeSalesBillDocNumber: params.excludeSalesBillDocNumber,
      })}`,
    ),
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
  list: () => request<RoleRow[]>('/roles?all=true'),
  create: (data: { name: string; description?: string; permissions: string[] }) =>
    request<RoleRow>('/roles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<RoleRow>(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),
};

// ── Tenants ──
export const tenants = {
  list: () => request<Array<{ id: string; name: string; logo?: string; inviteCode: string; status?: string; expiresAt?: string | null; role: string; permissions: unknown; joinedAt: string }>>('/tenants?all=true'),
  create: (data: { name: string; logo?: string }) =>
    request<{ tenant: { id: string; name: string; status: string }; message: string }>('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  select: async (id: string) => {
    const result = await request<{
      tenantId: string;
      tenantName: string;
      tenantRole: string;
      permissions: string[];
      expiresAt?: string | null;
      equipmentFeaturesEnabled?: boolean;
      accessToken: string;
      refreshToken: string;
    }>(`/tenants/${id}/select`, { method: 'POST' });
    if (result.accessToken) persistAccessToken(result.accessToken);
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
    request<any[]>('/collaboration/collaborations?all=true'),
  /** 单方解除企业协作（后端对双方租户同时清理绑定） */
  revokeCollaboration: (collaborationId: string) =>
    request<{ success: boolean; alreadyRevoked?: boolean }>(`/collaboration/collaborations/${collaborationId}`, {
      method: 'DELETE',
    }),

  syncDispatch: (data: { recordIds: string[]; collaborationTenantId: string; outsourceRouteId?: string }) =>
    request<{ dispatches: { transferId: string; dispatchId: string; productName: string }[] }>(
      '/collaboration/subcontract-transfers/sync-dispatch',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  listTransfers: (params?: Record<string, string>) => {
    const merged = { all: 'true', ...(params ?? {}) };
    const qs = '?' + new URLSearchParams(merged).toString();
    return request<any[]>(`/collaboration/subcontract-transfers${qs}`);
  },
  getTransfer: (id: string) =>
    request<any>(`/collaboration/subcontract-transfers/${id}`),

  acceptTransfer: (id: string, data: CollabAcceptTransferBody) =>
    request<any>(`/collaboration/subcontract-transfers/${id}/accept`, { method: 'POST', body: JSON.stringify(data) }),
  forwardTransfer: (id: string, data: { items: Array<{ colorName: string | null; sizeName: string | null; quantity: number }>; note?: string; warehouseId?: string; sharedDispatchDocNo?: string; unitPrice?: number }) =>
    request<{ newTransferId: string; dispatchId: string; nextStep: any; dispatchDocNo: string | null }>(`/collaboration/subcontract-transfers/${id}/forward`, { method: 'POST', body: JSON.stringify(data) }),
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

  // Dispatch 编辑同步
  updateDispatchPayload: (id: string, data: { recordIds: string[] }) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/payload`, { method: 'PUT', body: JSON.stringify(data) }),
  amendDispatch: (id: string, data: { recordIds: string[]; note?: string }) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/amend`, { method: 'POST', body: JSON.stringify(data) }),
  confirmDispatchAmendment: (id: string) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/confirm-amendment`, { method: 'PATCH' }),
  rejectDispatchAmendment: (id: string) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/reject-amendment`, { method: 'PATCH' }),
  ackDispatchPayloadRefresh: (id: string) =>
    request<any>(`/collaboration/subcontract-dispatches/${id}/ack-payload-refresh`, { method: 'PATCH' }),

  // Return 编辑同步
  updateReturnPayload: (id: string, data: { items: any[]; note?: string; warehouseId?: string }) =>
    request<any>(`/collaboration/subcontract-returns/${id}/payload`, { method: 'PUT', body: JSON.stringify(data) }),
  amendReturn: (id: string, data: { items: any[]; note?: string }) =>
    request<any>(`/collaboration/subcontract-returns/${id}/amend`, { method: 'POST', body: JSON.stringify(data) }),
  confirmReturnAmendment: (id: string) =>
    request<any>(`/collaboration/subcontract-returns/${id}/confirm-amendment`, { method: 'PATCH' }),
  rejectReturnAmendment: (id: string) =>
    request<any>(`/collaboration/subcontract-returns/${id}/reject-amendment`, { method: 'PATCH' }),

  listOutsourceRoutes: () =>
    request<any[]>('/collaboration/outsource-routes?all=true'),
  createOutsourceRoute: (data: { name: string; steps: any[] }) =>
    request<any>('/collaboration/outsource-routes', { method: 'POST', body: JSON.stringify(data) }),
  updateOutsourceRoute: (id: string, data: { name?: string; steps?: any[] }) =>
    request<any>(`/collaboration/outsource-routes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOutsourceRoute: (id: string) =>
    request(`/collaboration/outsource-routes/${id}`, { method: 'DELETE' }),

  listProductMaps: (collaborationId?: string) => {
    const qs = new URLSearchParams({ all: 'true' });
    if (collaborationId) qs.set('collaborationId', collaborationId);
    return request<any[]>(`/collaboration/collaboration-product-maps?${qs.toString()}`);
  },
  updateProductMap: (id: string, data: any) =>
    request<any>(`/collaboration/collaboration-product-maps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProductMap: (id: string) =>
    request(`/collaboration/collaboration-product-maps/${id}`, { method: 'DELETE' }),
};

// ── 单品码（ItemCode）──

export const itemCodesApi = {
  generate: (planOrderId: string) =>
    request<{ generated: number; totalForPlan: number; byVariant: Array<{ variantId: string | null; count: number }> }>(
      '/item-codes/generate',
      { method: 'POST', body: JSON.stringify({ planOrderId }) },
    ),

  list: (params: {
    planOrderId?: string;
    variantId?: string;
    batchId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const qs = new URLSearchParams();
    qs.set('all', 'true');
    if (params.planOrderId) qs.set('planOrderId', params.planOrderId);
    if (params.variantId) qs.set('variantId', params.variantId);
    if (params.batchId) qs.set('batchId', params.batchId);
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return request<{ items: import('../types').ItemCode[]; total: number; page: number; pageSize: number }>(
      `/item-codes?${qs.toString()}`,
    );
  },

  scan: (token: string) =>
    request<import('../types').ScanResult>(`/item-codes/scan/${encodeURIComponent(token)}`),

  trace: (token: string, params?: { page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page != null) qs.set('page', String(params.page));
    if (params?.pageSize != null) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return request<import('../types').TraceResult>(
      `/item-codes/trace/${encodeURIComponent(token)}${q ? `?${q}` : ''}`,
    );
  },
};

export const planVirtualBatchesApi = {
  create: (body: {
    planOrderId: string;
    variantId?: string | null;
    quantity: number;
    withItemCodes?: boolean;
  }) =>
    request<import('../types').PlanVirtualBatch & { itemCodesCreated?: number }>('/plan-virtual-batches', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  bulkSplit: (body: {
    planOrderId: string;
    variantId?: string | null;
    batchSize: number;
    withItemCodes?: boolean;
  }) =>
    request<{
      created: number;
      items: import('../types').PlanVirtualBatch[];
      batchSize: number;
      quantities: number[];
      totalQuantity: number;
      maxFromPlan: number;
      allocatedBefore: number;
      itemCodesCreated?: number;
    }>('/plan-virtual-batches/bulk-split', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** 计划树内出现的每个规格分别按每批件数拆满剩余额度，无需指定 variantId */
  bulkSplitAll: (body: { planOrderId: string; batchSize: number; withItemCodes?: boolean }) =>
    request<{
      totalCreated: number;
      items: import('../types').PlanVirtualBatch[];
      batchSize: number;
      byVariant: Array<{
        variantId: string | null;
        created: number;
        quantities: number[];
        totalQty: number;
      }>;
      itemCodesCreated?: number;
    }>('/plan-virtual-batches/bulk-split-all', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  list: (params: { planOrderId?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    qs.set('all', 'true');
    if (params.planOrderId) qs.set('planOrderId', params.planOrderId);
    if (params.page != null) qs.set('page', String(params.page));
    if (params.pageSize != null) qs.set('pageSize', String(params.pageSize));
    return request<{
      items: import('../types').PlanVirtualBatch[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/plan-virtual-batches?${qs.toString()}`);
  },

  subtreeAllocations: (params: { rootPlanOrderId: string }) =>
    request<{
      productId: string;
      allocations: Array<{ variantId: string | null; allocated: number }>;
    }>(
      `/plan-virtual-batches/subtree-allocations?${new URLSearchParams({
        rootPlanOrderId: params.rootPlanOrderId,
      }).toString()}`,
    ),

  scan: (token: string) =>
    request<import('../types').ScanResult>(`/plan-virtual-batches/scan/${encodeURIComponent(token)}`),

  trace: (token: string, params?: { page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page != null) qs.set('page', String(params.page));
    if (params?.pageSize != null) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return request<import('../types').TraceResult>(
      `/plan-virtual-batches/trace/${encodeURIComponent(token)}${q ? `?${q}` : ''}`,
    );
  },
};
