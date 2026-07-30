import { DEV_MATERIAL_BOM_MAX_DEPTH } from '../shared/types';
import type { BOMItem } from '../types';

export interface ProductBomExpandLine {
  rowKey: string;
  productId: string;
  quantity: number | null;
  note?: string;
  level: number;
  hasChildren: boolean;
}

/**
 * 工艺 BOM 明细按展开集合扁平化：顶层取当前工序 BOM 行，展开后挂产品档案下级（深度上限 + 路径防环）。
 */
export function buildProductBomExpandLines(
  items: BOMItem[],
  bomId: string,
  childrenByParent: Map<string, string[]>,
  unitQtyByParentChild: Map<string, Map<string, number>>,
  expandedKeys: ReadonlySet<string>,
): ProductBomExpandLine[] {
  const rows: ProductBomExpandLine[] = [];

  const walk = (
    productId: string,
    quantity: number | null,
    note: string | undefined,
    level: number,
    parentPath: string,
    pathVisited: Set<string>,
  ) => {
    const rowKey = parentPath ? `${parentPath}/${productId}` : `${bomId}:${productId}`;
    const canDescend =
      level < DEV_MATERIAL_BOM_MAX_DEPTH && !pathVisited.has(productId);
    const childIds = canDescend ? childrenByParent.get(productId) ?? [] : [];
    const hasChildren = childIds.length > 0;
    rows.push({
      rowKey,
      productId,
      quantity,
      note,
      level,
      hasChildren,
    });
    if (!hasChildren || !expandedKeys.has(rowKey)) return;

    const nextVisited = new Set(pathVisited);
    nextVisited.add(productId);
    const qtyUnderParent = unitQtyByParentChild.get(productId);
    for (const childId of childIds) {
      const childQty = qtyUnderParent?.get(childId);
      walk(
        childId,
        childQty == null || !Number.isFinite(childQty) ? null : childQty,
        undefined,
        level + 1,
        rowKey,
        nextVisited,
      );
    }
  };

  for (const item of items) {
    const productId = String(item.productId ?? '').trim();
    if (!productId) continue;
    const qty = Number(item.quantity);
    walk(productId, Number.isFinite(qty) ? qty : null, item.note, 1, '', new Set());
  }
  return rows;
}
