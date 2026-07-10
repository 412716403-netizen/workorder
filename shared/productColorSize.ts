/** 产品分类已启用颜色尺码时，保存前须至少选择 1 个颜色与 1 个尺码（前后端同口径）。 */

export const MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH =
  '该分类已启用颜色尺码，请至少选择 1 个颜色和 1 个尺码';

export const MSG_PRODUCT_COLOR_SIZE_REQUIRED_COLOR =
  '该分类已启用颜色尺码，请至少选择 1 个颜色';

export const MSG_PRODUCT_COLOR_SIZE_REQUIRED_SIZE =
  '该分类已启用颜色尺码，请至少选择 1 个尺码';

export function validateProductColorSizeForSave(params: {
  hasColorSize: boolean;
  colorIds: readonly string[] | null | undefined;
  sizeIds: readonly string[] | null | undefined;
}): string | null {
  if (!params.hasColorSize) return null;
  const colorCount = params.colorIds?.length ?? 0;
  const sizeCount = params.sizeIds?.length ?? 0;
  if (colorCount === 0 && sizeCount === 0) return MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH;
  if (colorCount === 0) return MSG_PRODUCT_COLOR_SIZE_REQUIRED_COLOR;
  if (sizeCount === 0) return MSG_PRODUCT_COLOR_SIZE_REQUIRED_SIZE;
  return null;
}

export function productColorSizeEnabled(
  product: { colorIds?: readonly string[] | null; sizeIds?: readonly string[] | null } | null | undefined,
  category: { hasColorSize?: boolean | null } | null | undefined,
): boolean {
  return (
    Boolean(product?.colorIds?.length && product?.sizeIds?.length) ||
    Boolean(category?.hasColorSize)
  );
}

/** 与 Web / 小程序报工详情一致：是否按颜色尺码规格矩阵计算可报余量 */
export function productHasColorSizeMatrix(
  product: { variants?: readonly { id: string }[] | null; colorIds?: readonly string[] | null; sizeIds?: readonly string[] | null } | null | undefined,
  category: { hasColorSize?: boolean | null } | null | undefined,
): boolean {
  const n = product?.variants?.length ?? 0;
  if (n < 1) return false;
  return productColorSizeEnabled(product, category) || n > 1;
}
