/**
 * "本机记忆"产品分类 → 上次选用的单位 id。
 *
 * 仅用于"新建产品选完分类后默认填一个单位"的偏好持久化；不参与业务规则计算，
 * 也不会随产品保存写后端，纯前端 localStorage（按 tenantId 分桶）。
 *
 * 拆自 ProductEditForm.tsx (Phase 3.1)，保留 LS key 兼容性。
 */
import type { Product } from '../types';

const LAST_UNIT_BY_CATEGORY_LS_PREFIX = 'stpro:lastUnitByProductCategory:v1';

function lastUnitByCategoryStorageKey(tenantId: string | null | undefined): string {
  const tid = tenantId && String(tenantId).trim() ? String(tenantId).trim() : '_';
  return `${LAST_UNIT_BY_CATEGORY_LS_PREFIX}:${tid}`;
}

export function readLastUnitByCategoryMap(tenantId: string | null | undefined): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(lastUnitByCategoryStorageKey(tenantId));
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLastUnitForCategory(
  tenantId: string | null | undefined,
  categoryId: string,
  unitId: string,
): void {
  if (typeof localStorage === 'undefined') return;
  const cid = categoryId.trim();
  const uid = unitId.trim();
  if (!cid || !uid) return;
  try {
    const key = lastUnitByCategoryStorageKey(tenantId);
    const map = readLastUnitByCategoryMap(tenantId);
    map[cid] = uid;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

/** 新建产品选分类时：本机该分类上次选的单位 → 否则同分类已有产品中最近更新的单位 */
export function resolveDefaultUnitForNewProductCategory(
  tenantId: string | null | undefined,
  categoryId: string,
  productsCatalog: Product[],
  unitIdsInDictionary: Set<string>,
): string | undefined {
  const cid = categoryId.trim();
  if (!cid || unitIdsInDictionary.size === 0) return undefined;

  const fromPrefs = readLastUnitByCategoryMap(tenantId)[cid];
  if (fromPrefs && unitIdsInDictionary.has(fromPrefs)) return fromPrefs;

  type PWithTs = Product & { updatedAt?: string };
  let bestUnit: string | undefined;
  let bestTs = -1;
  for (const p of productsCatalog as PWithTs[]) {
    if (p.categoryId !== cid) continue;
    const u = (p.unitId ?? '').trim();
    if (!u || !unitIdsInDictionary.has(u)) continue;
    const t = typeof p.updatedAt === 'string' && p.updatedAt ? Date.parse(p.updatedAt) : 0;
    const score = Number.isFinite(t) ? t : 0;
    if (score >= bestTs) {
      bestTs = score;
      bestUnit = u;
    }
  }
  return bestUnit;
}
