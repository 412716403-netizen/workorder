/**
 * 产品编号(sku)自动生成 + 保存前去重。
 *
 * 拆自 ProductEditForm.tsx (Phase 3.1)。规则：
 * - `generateAutoProductSku()`：两个大写字母（去掉 I/O 这种易误读字符）+ 毫秒时间戳
 * - `resolveProductSkuForSave(p, catalog)`：若 sku 未手填，则生成租户内唯一的候选编号；
 *   候选与现有产品 sku 冲突时最多重试 20 次（实际碰撞概率极小，时间戳维持单调）。
 */
import type { Product } from '../types';

/** 不含易误读字符 I/O 的大写字母集合 */
export const AUTO_SKU_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 两位大写字母前缀 + Date.now()；调用方一般不需要直接用，走 resolveProductSkuForSave */
export function generateAutoProductSku(): string {
  let prefix = '';
  for (let i = 0; i < 2; i++) {
    prefix += AUTO_SKU_LETTERS[Math.floor(Math.random() * AUTO_SKU_LETTERS.length)];
  }
  return `${prefix}${Date.now()}`;
}

/** 产品编号留空时生成租户内唯一的编号，供保存前写入 */
export function resolveProductSkuForSave(p: Product, catalog: Product[]): Product {
  const sku = (p.sku ?? '').trim();
  if (sku) return p;
  let candidate = '';
  for (let i = 0; i < 20; i++) {
    candidate = generateAutoProductSku();
    if (!catalog.some(o => o.id !== p.id && (o.sku ?? '').trim() === candidate)) break;
  }
  return { ...p, sku: candidate };
}
