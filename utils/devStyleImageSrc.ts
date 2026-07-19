/**
 * 开发款列表/侧栏取图：优先 imageThumb，未回填时回退 imageUrl。
 */

export type DevStyleImageFields = {
  imageThumb?: string | null;
  imageUrl?: string | null;
} | null | undefined;

/** 列表缩略图 src；无图返回空串 */
export function devStyleThumbSrc(style: DevStyleImageFields): string {
  const thumb = (style?.imageThumb ?? '').trim();
  if (thumb) return thumb;
  return (style?.imageUrl ?? '').trim();
}

/** 点击放大用的原图；无原图时回退缩略图 */
export function devStyleOriginalSrc(style: DevStyleImageFields): string {
  const original = (style?.imageUrl ?? '').trim();
  if (original) return original;
  return (style?.imageThumb ?? '').trim();
}

export function devStyleHasImage(style: DevStyleImageFields): boolean {
  return Boolean(devStyleThumbSrc(style));
}
