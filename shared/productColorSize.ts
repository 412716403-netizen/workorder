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
