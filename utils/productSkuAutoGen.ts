/**
 * 产品名称(sku) 保存前规范化。
 *
 * 历史曾支持留空自动生成；现规则：产品名称选填、不自动生成。
 * `resolveProductSkuForSave` 仅做 trim，空串保持为空。
 */
import type { Product } from '../types';

/** @deprecated 产品名称不再自动生成；保留导出以免旧引用报错 */
export const AUTO_SKU_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** @deprecated 产品名称不再自动生成 */
export function generateAutoProductSku(): string {
  let prefix = '';
  for (let i = 0; i < 2; i++) {
    prefix += AUTO_SKU_LETTERS[Math.floor(Math.random() * AUTO_SKU_LETTERS.length)];
  }
  return `${prefix}${Date.now()}`;
}

/** 保存前规范化 sku：只 trim，留空不生成 */
export function resolveProductSkuForSave(p: Product, _catalog: Product[]): Product {
  const sku = (p.sku ?? '').trim();
  if (sku === (p.sku ?? '')) return p;
  return { ...p, sku };
}
