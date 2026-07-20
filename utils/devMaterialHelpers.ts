import type { DevBomDto, DevMaterialLineInput, DevMaterialReturnableRow, Product } from '../types';
import { batchNoForDisplay } from '../types';

/** 试制 BOM 物料按 productId 去重（跨变体/工序） */
export function uniqueDevBomProductIds(boms: DevBomDto[] | undefined, styleId: string): string[] {
  const ids = new Set<string>();
  for (const bom of boms ?? []) {
    if (bom.parentStyleId !== styleId) continue;
    for (const item of bom.items ?? []) {
      const pid = String(item.productId ?? '').trim();
      if (pid) ids.add(pid);
    }
  }
  return [...ids];
}

export function productLabel(product: Product | undefined, productId: string): string {
  if (!product) return productId;
  const sku = product.sku?.trim();
  if (sku && sku !== product.name) return `${product.name}（${sku}）`;
  return product.name || productId;
}

export function returnableRowKey(row: Pick<DevMaterialReturnableRow, 'productId' | 'warehouseId' | 'batchNo'>): string {
  return `${row.productId}::${row.warehouseId}::${batchNoForDisplay(row.batchNo)}`;
}

export function buildIssueLines(
  qtyByProduct: Record<string, number>,
  warehouseId: string,
  batchByProduct: Record<string, string>,
  batchManagedProductIds: Set<string>,
): DevMaterialLineInput[] {
  const lines: DevMaterialLineInput[] = [];
  for (const [productId, rawQty] of Object.entries(qtyByProduct)) {
    const quantity = Number(rawQty);
    if (!(quantity > 0)) continue;
    const line: DevMaterialLineInput = { productId, quantity, warehouseId };
    if (batchManagedProductIds.has(productId)) {
      const bn = String(batchByProduct[productId] ?? '').trim();
      if (bn) line.batchNo = bn;
    }
    lines.push(line);
  }
  return lines;
}

export function buildReturnLines(
  qtyByKey: Record<string, number>,
  returnable: DevMaterialReturnableRow[],
): DevMaterialLineInput[] {
  const byKey = new Map(returnable.map((r) => [returnableRowKey(r), r]));
  const lines: DevMaterialLineInput[] = [];
  for (const [key, rawQty] of Object.entries(qtyByKey)) {
    const quantity = Number(rawQty);
    if (!(quantity > 0)) continue;
    const row = byKey.get(key);
    if (!row) continue;
    lines.push({
      productId: row.productId,
      quantity,
      warehouseId: row.warehouseId,
      batchNo: row.batchNo,
    });
  }
  return lines;
}
