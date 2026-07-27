/**
 * 工作台消息已读状态：本地缓存 + 服务端 membership.preferences 同步（网页/小程序共用）。
 */

import { dashboard } from '../services/api';

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
  return new Set(ids.map(String));
}

function writeLocalIds(
  tenantId: string,
  userId: string | null | undefined,
  ids: Iterable<string>,
): void {
  const key = compositeKey(tenantId, userId ?? '');
  const store = loadStore();
  store[key] = Array.from(new Set(Array.from(ids, String).filter(Boolean)));
  saveStore(store);
}

export function markDashboardNotificationRead(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
  messageId: string,
): void {
  if (!tenantId || !messageId) return;
  const prev = readDashboardNotificationIds(tenantId, userId);
  prev.add(String(messageId));
  writeLocalIds(tenantId, userId, prev);
}

export function replaceDashboardNotificationIds(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
  ids: string[],
): Set<string> {
  if (!tenantId) return new Set();
  const next = new Set((ids || []).map(String).filter(Boolean));
  writeLocalIds(tenantId, userId, next);
  return next;
}

/**
 * 拉取服务端已读并与本地合并；本地多出的 id 会上报，保证网页已读后小程序也清未读。
 */
export async function syncDashboardNotificationReads(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (!tenantId) return new Set();
  const local = readDashboardNotificationIds(tenantId, userId);
  try {
    const remote = await dashboard.getNotificationReads();
    const remoteIds = Array.isArray(remote?.ids) ? remote.ids.map(String) : [];
    const remoteSet = new Set(remoteIds);
    const merged = new Set([...remoteIds, ...local]);
    const localOnly = [...local].filter(id => !remoteSet.has(id));
    if (localOnly.length > 0) {
      const saved = await dashboard.markNotificationReads(localOnly);
      const ids = Array.isArray(saved?.ids) ? saved.ids.map(String) : [...merged];
      return replaceDashboardNotificationIds(tenantId, userId, ids);
    }
    return replaceDashboardNotificationIds(tenantId, userId, [...merged]);
  } catch {
    return local;
  }
}

/** 乐观写入本地并异步上报服务端 */
export function markDashboardNotificationReadAndSync(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
  messageId: string,
): void {
  markDashboardNotificationRead(tenantId, userId, messageId);
  if (!tenantId || !messageId) return;
  void dashboard.markNotificationReads([String(messageId)]).catch(() => {
    /* 网络失败时保留本地已读，下次 sync 再补报 */
  });
}
