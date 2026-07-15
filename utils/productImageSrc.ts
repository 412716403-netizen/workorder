/**
 * Phase 3.H：产品列表/打印取图。
 * lite 列表只带 imageThumb；未回填或外链存量数据回退 imageUrl。
 */

export type ProductImageFields = {
  imageThumb?: string | null;
  imageUrl?: string | null;
} | null | undefined;

/** 列表缩略图 / 打印主图 src；无图返回空串 */
export function productThumbSrc(product: ProductImageFields): string {
  const thumb = (product?.imageThumb ?? '').trim();
  if (thumb) return thumb;
  return (product?.imageUrl ?? '').trim();
}

export function productHasImage(product: ProductImageFields): boolean {
  return Boolean(productThumbSrc(product));
}

/**
 * 写入 AppData 列表缓存时去掉原图，避免单次编辑后把 base64 原图重新灌回内存。
 * 保留 imageThumb；若无 thumb 则保留 imageUrl 以兼容未回填数据。
 */
export function stripProductOriginalForListCache<T extends {
  imageThumb?: string | null;
  imageUrl?: string | null;
}>(product: T): T {
  const thumb = (product.imageThumb ?? '').trim();
  if (!thumb) return product;
  if (product.imageUrl == null || product.imageUrl === undefined) return product;
  const { imageUrl: _omit, ...rest } = product;
  return rest as T;
}
