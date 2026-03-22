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
