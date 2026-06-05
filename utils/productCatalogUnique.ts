import type { Product } from '../types';

export const PRODUCT_NAME_TAKEN_MSG = '产品名称在租户内已存在，请更换';
export const PRODUCT_SKU_TAKEN_MSG = '产品编号在租户内已存在，请更换';

export function isProductNameTakenInCatalog(
  catalog: Product[],
  name: string,
  excludeProductId?: string,
): boolean {
  const n = name.trim();
  if (!n) return false;
  return catalog.some((p) => p.id !== excludeProductId && (p.name ?? '').trim() === n);
}

export function isProductSkuTakenInCatalog(
  catalog: Product[],
  sku: string,
  excludeProductId?: string,
): boolean {
  const s = sku.trim();
  if (!s) return false;
  return catalog.some((p) => p.id !== excludeProductId && (p.sku ?? '').trim() === s);
}

/** @returns 错误文案；通过则 null */
export function validateProductCatalogUnique(
  catalog: Product[],
  opts: { name: string; sku: string; excludeProductId?: string },
): string | null {
  if (isProductNameTakenInCatalog(catalog, opts.name, opts.excludeProductId)) {
    return PRODUCT_NAME_TAKEN_MSG;
  }
  if (isProductSkuTakenInCatalog(catalog, opts.sku, opts.excludeProductId)) {
    return PRODUCT_SKU_TAKEN_MSG;
  }
  return null;
}
