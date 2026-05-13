import type { Product, ProductCategory } from '../types';
import { getProductCategoryCustomFieldEntries } from './reportCustomDocField';

const MAX_STRING_SCAN = 800;

function appendFlattenedValues(parts: string[], val: unknown, depth: number): void {
  if (depth > 10) return;
  if (val == null) return;
  if (typeof val === 'string') {
    if (val.startsWith('data:')) {
      parts.push('[附件]');
      return;
    }
    if (val.length > MAX_STRING_SCAN) return;
    parts.push(val);
    return;
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    parts.push(String(val));
    return;
  }
  if (Array.isArray(val)) {
    for (const x of val) appendFlattenedValues(parts, x, depth + 1);
    return;
  }
  if (typeof val === 'object') {
    for (const v of Object.values(val as Record<string, unknown>)) {
      appendFlattenedValues(parts, v, depth + 1);
    }
  }
}

/**
 * 产品档案 / BOM 选料搜索：除名称、SKU、描述外，纳入分类自定义字段展示值、
 * `categoryCustomData` 中其余键值、以及 `routeReportValues` / `routeReportDisplayValues` 中的文本。
 * 附件型 data URL 不参与全文匹配（仅追加占位「附件」便于搜「附件」类关键词）。
 */
export function buildProductSearchHaystackLower(product: Product, category: ProductCategory | null | undefined): string {
  const parts: string[] = [];
  appendFlattenedValues(parts, product.categoryCustomData, 0);
  appendFlattenedValues(parts, product.routeReportValues, 0);
  appendFlattenedValues(parts, product.routeReportDisplayValues, 0);
  for (const e of getProductCategoryCustomFieldEntries(product, category, { includeFile: true, includeEmpty: false })) {
    parts.push(e.field.label, e.display);
  }
  return parts.filter(Boolean).join('\u0001').toLowerCase();
}

export function productMatchesSearchQuery(
  product: Product,
  category: ProductCategory | null | undefined,
  qRaw: string,
): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  const n = (product.name ?? '').toLowerCase();
  const s = (product.sku ?? '').toLowerCase();
  const d = (product.description ?? '').toLowerCase();
  if (n.includes(q) || s.includes(q) || d.includes(q)) return true;
  return buildProductSearchHaystackLower(product, category).includes(q);
}
