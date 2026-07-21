import type { Product } from '../types';

export const PRODUCT_NAME_TAKEN_MSG = '产品编号在租户内已存在，请更换';
/** @deprecated 产品名称允许租户内重复，不再用于拦截保存 */
export const PRODUCT_SKU_TAKEN_MSG = '产品名称在租户内已存在，请更换';

export function isProductNameTakenInCatalog(
  catalog: Product[],
  name: string,
  excludeProductId?: string,
): boolean {
  const n = name.trim();
  if (!n) return false;
  return catalog.some((p) => p.id !== excludeProductId && (p.name ?? '').trim() === n);
}

/** 产品名称允许重复，恒为 false（保留导出以免旧引用报错） */
export function isProductSkuTakenInCatalog(
  _catalog: Product[],
  _sku: string,
  _excludeProductId?: string,
): boolean {
  return false;
}

/** @returns 错误文案；通过则 null。仅校验产品编号唯一。 */
export function validateProductCatalogUnique(
  catalog: Product[],
  opts: { name: string; sku: string; excludeProductId?: string },
): string | null {
  if (isProductNameTakenInCatalog(catalog, opts.name, opts.excludeProductId)) {
    return PRODUCT_NAME_TAKEN_MSG;
  }
  return null;
}
