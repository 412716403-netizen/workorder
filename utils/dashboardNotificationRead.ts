/**
 * 工作台消息已读状态（浏览器 localStorage，按租户 + 用户隔离）。
 */

const STORAGE_KEY = 'smarttrack.dashboardNotificationRead.v1';

type StoreShape = Record<string, string[]>;

function compositeKey(tenantId: string, userId: string): string {
  const uid = userId?.trim() || 'unknown';
  return `${tenantId}|${uid}`;
}

function loadStore(): StoreShape {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as StoreShape) : {};
  } catch {
    return {};
  }
}

function saveStore(store: StoreShape): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function readDashboardNotificationIds(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
): Set<string> {
  if (!tenantId) return new Set();
  const ids = loadStore()[compositeKey(tenantId, userId ?? '')] ?? [];
  return new Set(ids);
}

export function markDashboardNotificationRead(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
  messageId: string,
): void {
  if (!tenantId || !messageId) return;
  const key = compositeKey(tenantId, userId ?? '');
  const store = loadStore();
  const prev = new Set(store[key] ?? []);
  prev.add(messageId);
  store[key] = [...prev];
  saveStore(store);
}
