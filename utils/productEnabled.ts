import type { Product } from '../types';

/** 缺省视为启用，兼容历史数据与旧缓存 */
export function isProductEnabled(p: Pick<Product, 'enabled'> | null | undefined): boolean {
  return p?.enabled !== false;
}

/** 商品选择下拉：默认只含启用产品；keepId 为当前已选 id 时仍保留（用于展示已选禁用项） */
export function filterSelectableProducts(products: Product[], keepId?: string): Product[] {
  return products.filter(p => isProductEnabled(p) || p.id === keepId);
}
