/**
 * 外协发出同步协作时「外协路线」按产品记忆（localStorage：租户 + 产品 + 协作企业）。
 */

const STORAGE_KEY = 'smarttrack.outsourceCollabRouteByProduct.v1';

type StoreShape = Record<string, string>;

function compositeKey(tenantId: string, productId: string, collaborationTenantId: string): string {
  const tid = tenantId?.trim() || 'unknown';
  const pid = productId?.trim() || '';
  const cid = collaborationTenantId?.trim() || '';
  return `${tid}|${pid}|${cid}`;
}

function loadStore(): StoreShape {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as StoreShape;
  } catch {
    return {};
  }
}

function saveStore(store: StoreShape): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readOutsourceCollabRoutePreference(
  tenantId: string | undefined | null,
  productId: string,
  collaborationTenantId: string,
): string | null {
  if (!tenantId?.trim() || !productId.trim() || !collaborationTenantId.trim()) return null;
  const k = compositeKey(tenantId, productId, collaborationTenantId);
  const v = loadStore()[k];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function writeOutsourceCollabRoutePreference(
  tenantId: string | undefined | null,
  productId: string,
  collaborationTenantId: string,
  outsourceRouteId: string,
): void {
  if (!tenantId?.trim() || !productId.trim() || !collaborationTenantId.trim()) return;
  const rid = outsourceRouteId.trim();
  if (!rid) return;
  const k = compositeKey(tenantId, productId, collaborationTenantId);
  const next = { ...loadStore(), [k]: rid };
  saveStore(next);
}

/** 若 preferred 在 allowedRouteIds 中则返回之，否则返回空串（走「不使用路线」） */
export function resolvePreferredOutsourceRouteId(
  preferred: string | null | undefined,
  allowedRouteIds: readonly string[],
): string {
  if (!preferred?.trim()) return '';
  return allowedRouteIds.includes(preferred.trim()) ? preferred.trim() : '';
}
