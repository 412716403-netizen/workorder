type BomMaterialVariant = {
  colorId?: unknown;
  sizeId?: unknown;
};

type BomMaterialProduct = {
  colorIds?: unknown;
  sizeIds?: unknown;
  variants?: BomMaterialVariant[] | null;
};

function hasConfiguredDimension(value: unknown): boolean {
  return Array.isArray(value) && value.some((id) => String(id ?? '').trim() !== '');
}

/**
 * 真正配置了颜色/尺码的产品不可作为 BOM 子件。
 * 无色无码产品由开发发布时会生成一个空维度默认变体；该变体不代表颜色尺码，允许作为子件。
 * 多个空维度变体属于异常规格数据，仍按规格产品拦截。
 */
export function isProductBlockedAsBomMaterialValue(product: BomMaterialProduct): boolean {
  if (hasConfiguredDimension(product.colorIds) || hasConfiguredDimension(product.sizeIds)) {
    return true;
  }
  const variants = product.variants ?? [];
  if (variants.length > 1) return true;
  return variants.some(
    (variant) =>
      String(variant.colorId ?? '').trim() !== ''
      || String(variant.sizeId ?? '').trim() !== '',
  );
}
