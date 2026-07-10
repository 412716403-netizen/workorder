import type { AppDictionaries, Product } from '../types';

export type ReportVariantQtyLine = {
  variantId?: string | null;
  quantity?: number | null;
  defectiveQuantity?: number | null;
};

/** 报工列表/审核：解析单条规格展示名 */
export function resolveReportVariantLabel(
  product: Product | undefined,
  variantId: string | null | undefined,
  dictionaries?: AppDictionaries,
): string {
  if (!variantId) return '通栏';
  const variant = product?.variants?.find((v) => v.id === variantId);
  if (!variant) return variantId;
  if (variant.skuSuffix?.trim()) return variant.skuSuffix.trim();
  const color = dictionaries?.colors?.find((c) => c.id === variant.colorId)?.name;
  const size = dictionaries?.sizes?.find((s) => s.id === variant.sizeId)?.name;
  const parts = [color, size].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : variantId;
}

/** 报工批次内各规格数量摘要，如「红 / M ×5 · 蓝 / L ×5」 */
export function buildReportVariantQtySummary(
  lines: ReportVariantQtyLine[],
  product?: Product,
  dictionaries?: AppDictionaries,
): { text: string; show: boolean; variantCount: number } {
  const active = lines.filter(
    (l) => (Number(l.quantity) || 0) > 0 || (Number(l.defectiveQuantity) || 0) > 0,
  );
  if (active.length === 0) {
    return { text: '', show: false, variantCount: 0 };
  }
  const variantCount = new Set(active.map((l) => l.variantId || '')).size;
  const shouldShow =
    active.length > 1 ||
    Boolean(active[0]?.variantId) ||
    (product?.variants?.length ?? 0) > 1;
  if (!shouldShow) {
    return { text: '', show: false, variantCount: Math.max(1, variantCount) };
  }
  const parts = active.map((l) => {
    const qty = Number(l.quantity) || 0;
    const label = resolveReportVariantLabel(product, l.variantId ?? null, dictionaries);
    return `${label} ×${qty}`;
  });
  return { text: parts.join(' · '), show: true, variantCount };
}
