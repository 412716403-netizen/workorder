/** 颜色尺码校验（对齐 shared/productColorSize.ts） */

const MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH =
  '该分类已启用颜色尺码，请至少选择 1 个颜色和 1 个尺码';
const MSG_PRODUCT_COLOR_SIZE_REQUIRED_COLOR =
  '该分类已启用颜色尺码，请至少选择 1 个颜色';
const MSG_PRODUCT_COLOR_SIZE_REQUIRED_SIZE =
  '该分类已启用颜色尺码，请至少选择 1 个尺码';

function productColorSizeEnabled(product, category) {
  return Boolean(
    category && category.hasColorSize
      && product
      && product.colorIds && product.colorIds.length
      && product.sizeIds && product.sizeIds.length,
  );
}

function validateProductColorSizeForSave(params) {
  if (!params.hasColorSize) return null;
  const colorCount = (params.colorIds && params.colorIds.length) || 0;
  const sizeCount = (params.sizeIds && params.sizeIds.length) || 0;
  if (colorCount === 0 && sizeCount === 0) return MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH;
  if (colorCount === 0) return MSG_PRODUCT_COLOR_SIZE_REQUIRED_COLOR;
  if (sizeCount === 0) return MSG_PRODUCT_COLOR_SIZE_REQUIRED_SIZE;
  return null;
}

function validateProductColorSizeSelection(product, category) {
  if (!category || !category.hasColorSize) return null;
  return validateProductColorSizeForSave({
    hasColorSize: true,
    colorIds: product && product.colorIds,
    sizeIds: product && product.sizeIds,
  });
}

module.exports = {
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH,
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_COLOR,
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_SIZE,
  productColorSizeEnabled,
  validateProductColorSizeForSave,
  validateProductColorSizeSelection,
};
