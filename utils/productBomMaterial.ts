import type { Product } from '../types';
import { isProductBlockedAsBomMaterialValue } from '../shared/productBomMaterial';

/** 真正含颜色/尺码的产品不可作为 BOM 子件；空维度默认变体不拦截（与后端一致） */
export function isProductBlockedAsBomMaterial(p: Pick<Product, 'variants' | 'colorIds' | 'sizeIds'>): boolean {
  return isProductBlockedAsBomMaterialValue(p);
}
