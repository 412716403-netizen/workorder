import type { ProductVariant } from '../types';

/**
 * Sort grouped variant entries by product.colorIds order,
 * and sort variants within each group by product.sizeIds order.
 */
export function sortedVariantColorEntries(
  grouped: Record<string, ProductVariant[]>,
  colorIds?: string[],
  sizeIds?: string[]
): [string, ProductVariant[]][] {
  const entries = Object.entries(grouped) as [string, ProductVariant[]][];
  if (colorIds?.length) {
    const colorOrder = new Map(colorIds.map((id, i) => [id, i]));
    entries.sort(([a], [b]) => (colorOrder.get(a) ?? Infinity) - (colorOrder.get(b) ?? Infinity));
  }
  if (sizeIds?.length) {
    const sizeOrder = new Map(sizeIds.map((id, i) => [id, i]));
    for (const [, variants] of entries) {
      variants.sort((a, b) => (sizeOrder.get(a.sizeId) ?? Infinity) - (sizeOrder.get(b.sizeId) ?? Infinity));
    }
  }
  return entries;
}

/**
 * Sort generic grouped-by-color entries by product.colorIds order.
 * Works with any value type (e.g. { colorName, items } from variantBreakdown).
 */
export function sortedColorEntries<T>(
  grouped: Record<string, T>,
  colorIds?: string[]
): [string, T][] {
  const entries = Object.entries(grouped) as [string, T][];
  if (colorIds?.length) {
    const colorOrder = new Map(colorIds.map((id, i) => [id, i]));
    entries.sort(([a], [b]) => (colorOrder.get(a) ?? Infinity) - (colorOrder.get(b) ?? Infinity));
  }
  return entries;
}

/**
 * 扁平变体列表按产品「颜色顺序 → 尺码顺序」排序（与规格矩阵、BOM「复制现有方案」下拉一致）。
 * 未出现在 colorIds/sizeIds 中的项排在同组末尾，再按 id 稳定序。
 */
export function sortVariantsByColorThenSize(
  variants: ProductVariant[],
  colorIds?: string[],
  sizeIds?: string[],
): ProductVariant[] {
  const colorOrder = new Map((colorIds ?? []).map((id, i) => [id, i]));
  const sizeOrder = new Map((sizeIds ?? []).map((id, i) => [id, i]));
  return [...variants].sort((a, b) => {
    const ca = colorOrder.get(a.colorId) ?? Infinity;
    const cb = colorOrder.get(b.colorId) ?? Infinity;
    if (ca !== cb) return ca - cb;
    const sa = sizeOrder.get(a.sizeId) ?? Infinity;
    const sb = sizeOrder.get(b.sizeId) ?? Infinity;
    if (sa !== sb) return sa - sb;
    return (a.id || '').localeCompare(b.id || '', 'zh-CN');
  });
}
