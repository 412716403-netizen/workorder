import type { Product } from '../types';

/**
 * 采购入库：按**所有行**的 `customData.relatedProductId` 去重后，顿号连接展示（列表/打印汇总用）。
 * 无行级关联时回退为 — 。
 */
export function aggregatePurchaseBillRelatedProductListText(
  lineRows: Array<{ customData?: unknown }>,
  productMap?: Map<string, Product>,
): string {
  const ids: string[] = [];
  for (const row of lineRows) {
    const cd = row.customData;
    if (!cd || typeof cd !== 'object' || Array.isArray(cd)) continue;
    const id = String((cd as Record<string, unknown>).relatedProductId ?? '').trim();
    if (id) ids.push(id);
  }
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return '—';
  return unique
    .map((id) => {
      const p = productMap?.get(id);
      if (!p) return id;
      return p.sku ? `${p.name || '—'}（${p.sku}）` : (p.name || id);
    })
    .join('、');
}

/** 行级关联成品名称；无关联或查不到时返回空串 */
export function relatedProductNameForPrint(
  relatedProductId: string | undefined,
  productMap: Map<string, Product>,
): string {
  const id = String(relatedProductId ?? '').trim();
  if (!id) return '';
  return productMap.get(id)?.name ?? '';
}

/** 行级关联成品货号；无关联或查不到时返回空串 */
export function relatedProductSkuForPrint(
  relatedProductId: string | undefined,
  productMap: Map<string, Product>,
): string {
  const id = String(relatedProductId ?? '').trim();
  if (!id) return '';
  return productMap.get(id)?.sku ?? '';
}
