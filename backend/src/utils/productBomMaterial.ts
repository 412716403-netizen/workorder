/** 与前端 `utils/productBomMaterial.ts` 口径一致：含颜色/尺码或已有变体的产品不可作 BOM 子件 */
export function isProductBlockedAsBomMaterialDb(row: {
  colorIds: unknown;
  sizeIds: unknown;
  variants: { id: string }[];
}): boolean {
  if (row.variants.length > 0) return true;
  if (Array.isArray(row.colorIds) && row.colorIds.length > 0) return true;
  if (Array.isArray(row.sizeIds) && row.sizeIds.length > 0) return true;
  return false;
}
