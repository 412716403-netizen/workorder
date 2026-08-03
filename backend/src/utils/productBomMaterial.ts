import { isProductBlockedAsBomMaterialValue } from '../../../shared/productBomMaterial.js';

/** 与前端一致：真正含颜色/尺码的产品不可作 BOM 子件，空维度默认变体允许 */
export function isProductBlockedAsBomMaterialDb(row: {
  colorIds: unknown;
  sizeIds: unknown;
  variants: Array<{ colorId?: unknown; sizeId?: unknown }>;
}): boolean {
  return isProductBlockedAsBomMaterialValue(row);
}
