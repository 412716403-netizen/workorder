/**
 * 共享 HTTP 客户端：fetch 封装 + token 管理 + JWT 续期。
 * 各业务域模块 (auth.ts / orders.ts / psi.ts ...) 通过 `request()` 调用 API。
 */

/** 生产或未走 Vite 时可用 VITE_API_BASE；开发默认走同源 /api，由 Vite 代理到本机 3001（支持局域网 IP 访问前端） */
export const API_BASE =
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

export function persistAccessToken(access: string | null) {
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

export async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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

export function buildQs(params?: PaginationParams | Record<string, string>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

// ── Generic CRUD helpers ──
export function crud<T = unknown>(base: string) {
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
