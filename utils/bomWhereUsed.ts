import type { BOM } from '../types';

/**
 * 找出哪些产品的 BOM 把 materialProductId 当子件用（一层直接父级，排除自引用）。
 * 返回去重后的父产品 id，顺序按 boms 首次命中顺序。
 */
export function findBomParentProductIds(
  boms: BOM[],
  materialProductId: string,
): string[] {
  const id = (materialProductId ?? '').trim();
  if (!id) return [];

  const parentIds = new Set<string>();
  for (const bom of boms) {
    const parentId = (bom.parentProductId ?? '').trim();
    if (!parentId || parentId === id || parentIds.has(parentId)) continue;
    if ((bom.items ?? []).some(item => (item.productId ?? '').trim() === id)) {
      parentIds.add(parentId);
    }
  }
  return Array.from(parentIds);
}
