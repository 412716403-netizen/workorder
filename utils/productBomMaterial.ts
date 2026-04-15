import type { Product } from '../types';

/** 含颜色/尺码配置或已有变体的产品，不可作为 BOM 子件（与后端校验口径一致） */
export function isProductBlockedAsBomMaterial(p: Pick<Product, 'variants' | 'colorIds' | 'sizeIds'>): boolean {
  if ((p.variants?.length ?? 0) > 0) return true;
  if ((p.colorIds?.length ?? 0) > 0) return true;
  if ((p.sizeIds?.length ?? 0) > 0) return true;
  return false;
}
