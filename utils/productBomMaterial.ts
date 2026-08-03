import type { Product } from '../types';
import {
  isProductBlockedAsBomMaterialValue,
  isSingleSkuProductValue,
} from '../shared/productBomMaterial';

type BomMaterialProductShape = Pick<Product, 'variants' | 'colorIds' | 'sizeIds'>;

/** 无色无码，包括开发发布生成的单个空维度默认变体。 */
export function isSingleSkuProduct(p: BomMaterialProductShape): boolean {
  return isSingleSkuProductValue(p);
}

/** 真正含颜色/尺码的产品不可作为 BOM 子件；空维度默认变体不拦截（与后端一致） */
export function isProductBlockedAsBomMaterial(p: BomMaterialProductShape): boolean {
  return isProductBlockedAsBomMaterialValue(p);
}
