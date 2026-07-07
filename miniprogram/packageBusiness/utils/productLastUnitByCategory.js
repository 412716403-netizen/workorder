/** 产品分类默认单位偏好（wx storage，对齐 Web productLastUnitByCategory.ts） */

const LAST_UNIT_BY_CATEGORY_LS_PREFIX = 'stpro:lastUnitByProductCategory:v1';

function lastUnitByCategoryStorageKey(tenantId) {
  const tid = tenantId && String(tenantId).trim() ? String(tenantId).trim() : '_';
  return `${LAST_UNIT_BY_CATEGORY_LS_PREFIX}:${tid}`;
}

function readLastUnitByCategoryMap(tenantId) {
  try {
    const raw = wx.getStorageSync(lastUnitByCategoryStorageKey(tenantId));
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    Object.keys(raw).forEach((k) => {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    });
    return out;
  } catch {
    return {};
  }
}

function writeLastUnitForCategory(tenantId, categoryId, unitId) {
  const cid = String(categoryId || '').trim();
  const uid = String(unitId || '').trim();
  if (!cid || !uid) return;
  try {
    const key = lastUnitByCategoryStorageKey(tenantId);
    const map = readLastUnitByCategoryMap(tenantId);
    map[cid] = uid;
    wx.setStorageSync(key, map);
  } catch {
    // ignore
  }
}

function resolveDefaultUnitForNewProductCategory(tenantId, categoryId, productsCatalog, unitIdsInDictionary) {
  const cid = String(categoryId || '').trim();
  const unitSet = unitIdsInDictionary instanceof Set
    ? unitIdsInDictionary
    : new Set(unitIdsInDictionary || []);
  if (!cid || unitSet.size === 0) return undefined;

  const fromPrefs = readLastUnitByCategoryMap(tenantId)[cid];
  if (fromPrefs && unitSet.has(fromPrefs)) return fromPrefs;

  let bestUnit;
  let bestTs = -1;
  (productsCatalog || []).forEach((p) => {
    if (p.categoryId !== cid) return;
    const u = String(p.unitId || '').trim();
    if (!u || !unitSet.has(u)) return;
    const t = typeof p.updatedAt === 'string' && p.updatedAt ? Date.parse(p.updatedAt) : 0;
    const score = Number.isFinite(t) ? t : 0;
    if (score >= bestTs) {
      bestTs = score;
      bestUnit = u;
    }
  });
  return bestUnit;
}

module.exports = {
  readLastUnitByCategoryMap,
  writeLastUnitForCategory,
  resolveDefaultUnitForNewProductCategory,
};
