import type { Product, ProductCategory } from '../types';
import { validateProductColorSizeForSave as validateProductColorSizeForSaveShared } from '../shared/productColorSize';

export {
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_BOTH,
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_COLOR,
  MSG_PRODUCT_COLOR_SIZE_REQUIRED_SIZE,
  validateProductColorSizeForSave,
} from '../shared/productColorSize';

/**
 * 与工单报工（ReportModal）一致：类目启用颜色尺码，或产品上同时配置了颜色+尺码维度。
 * 不判断 variant 条数（用于表单是否「按规格」逻辑，与是否有 variant 数据分开考虑）。
 */
export function productColorSizeEnabled(
  product: Product | undefined,
  category: ProductCategory | undefined,
): boolean {
  return (
    Boolean(product?.colorIds?.length && product?.sizeIds?.length) ||
    Boolean(category?.hasColorSize)
  );
}

/** 保存产品档案前：分类已启用颜色尺码时须至少 1 色 1 码。返回错误文案，通过则 null。 */
export function validateProductColorSizeSelection(
  product: Pick<Product, 'colorIds' | 'sizeIds'>,
  category: ProductCategory | undefined,
): string | null {
  return validateProductColorSizeForSaveShared({
    hasColorSize: Boolean(category?.hasColorSize),
    colorIds: product.colorIds,
    sizeIds: product.sizeIds,
  });
}

/**
 * 单据新增/详情中是否按规格矩阵展示与录入：
 * 至少 1 条 variant，且（已启用颜色尺码 或 多条规格）。
 */
export function productHasColorSizeMatrix(
  product: Product | undefined,
  category: ProductCategory | undefined,
): boolean {
  const n = product?.variants?.length ?? 0;
  if (n < 1) return false;
  return productColorSizeEnabled(product, category) || n > 1;
}
