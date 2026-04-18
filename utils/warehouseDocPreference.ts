/**
 * 浏览器端「租户 + 用户 + 单据类型」仓库记忆（localStorage）。
 * 经办人键使用 currentUser.id，不用 operator 显示名。
 */

import type { Warehouse } from '../types';

const STORAGE_KEY = 'smarttrack.lastWarehousePrefs.v1';

export const WAREHOUSE_DOC_KIND = {
  PURCHASE_BILL: 'PURCHASE_BILL',
  SALES_BILL: 'SALES_BILL',
  PSI_TRANSFER: 'PSI_TRANSFER',
  PSI_STOCKTAKE: 'PSI_STOCKTAKE',
  SALES_ORDER_ALLOCATION: 'SALES_ORDER_ALLOCATION',
  PROD_MATERIAL_ISSUE: 'PROD_MATERIAL_ISSUE',
  PROD_REWORK_MATERIAL_ISSUE: 'PROD_REWORK_MATERIAL_ISSUE',
  PROD_PENDING_STOCK_IN: 'PROD_PENDING_STOCK_IN',
  PROD_PENDING_STOCK_IN_BATCH: 'PROD_PENDING_STOCK_IN_BATCH',
  PROD_STOCK_MATERIAL_FORM_OUT: 'PROD_STOCK_MATERIAL_FORM_OUT',
  PROD_STOCK_MATERIAL_FORM_IN: 'PROD_STOCK_MATERIAL_FORM_IN',
  PROD_STOCK_CONFIRM_OUT: 'PROD_STOCK_CONFIRM_OUT',
  PROD_STOCK_CONFIRM_IN: 'PROD_STOCK_CONFIRM_IN',
  OUTSOURCE_MAT_DISPATCH: 'OUTSOURCE_MAT_DISPATCH',
  OUTSOURCE_MAT_RETURN: 'OUTSOURCE_MAT_RETURN',
  COLLAB_RETURN: 'COLLAB_RETURN',
  COLLAB_FORWARD: 'COLLAB_FORWARD',
} as const;

export type WarehouseDocKind = (typeof WAREHOUSE_DOC_KIND)[keyof typeof WAREHOUSE_DOC_KIND];

export type WarehousePreferencePayload = {
  warehouseId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
};

type StoreShape = Record<string, WarehousePreferencePayload>;

function compositeKey(tenantId: string, userId: string, docKind: string): string {
  const uid = userId?.trim() || 'unknown';
  return `${tenantId}|${uid}|${docKind}`;
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

/** 若 preferredId 在 warehouses 中存在则返回之，否则返回 fallbackId ?? '' */
export function resolveWarehouseId(
  warehouses: Pick<Warehouse, 'id'>[],
  preferredId: string | undefined | null,
  fallbackId?: string | null,
): string {
  const ids = new Set(warehouses.map(w => w.id));
  if (preferredId && ids.has(preferredId)) return preferredId;
  if (fallbackId && ids.has(fallbackId)) return fallbackId;
  return '';
}

export function readWarehousePreference(
  tenantId: string | undefined | null,
  userId: string | undefined | null,
  docKind: WarehouseDocKind,
): WarehousePreferencePayload | null {
  if (!tenantId?.trim()) return null;
  const key = compositeKey(tenantId.trim(), userId ?? '', docKind);
  const store = loadStore();
  const v = store[key];
  if (!v || typeof v !== 'object') return null;
  return v;
}

export function writeWarehousePreference(
  tenantId: string | undefined | null,
  userId: string | undefined | null,
  docKind: WarehouseDocKind,
  payload: WarehousePreferencePayload,
): void {
  if (!tenantId?.trim()) return;
  const key = compositeKey(tenantId.trim(), userId ?? '', docKind);
  const store = loadStore();
  store[key] = { ...payload };
  saveStore(store);
}

/** 从偏好中取单个仓 id，校验后返回；无效则返回 fallback */
export function resolvePreferredSingleWarehouse(
  warehouses: Pick<Warehouse, 'id'>[],
  pref: WarehousePreferencePayload | null,
  fallbackId?: string | null,
): string {
  return resolveWarehouseId(warehouses, pref?.warehouseId, fallbackId);
}

/** 调拨：分别校验 from/to，无效则对应位为空字符串 */
export function resolvePreferredTransferWarehouses(
  warehouses: Pick<Warehouse, 'id'>[],
  pref: WarehousePreferencePayload | null,
): { fromWarehouseId: string; toWarehouseId: string } {
  const ids = new Set(warehouses.map(w => w.id));
  const from = pref?.fromWarehouseId && ids.has(pref.fromWarehouseId) ? pref.fromWarehouseId : '';
  const to = pref?.toWarehouseId && ids.has(pref.toWarehouseId) ? pref.toWarehouseId : '';
  return { fromWarehouseId: from, toWarehouseId: to };
}
