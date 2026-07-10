/**
 * 报工列表规格数量摘要（主包 pages/scan，避免跨分包 require）
 */

function resolveReportVariantLabel(product, variantId, dictionaries) {
  if (!variantId) return '通栏';
  const variants = (product && product.variants) || [];
  const variant = variants.find((v) => v.id === variantId);
  if (!variant) return variantId;
  if (variant.skuSuffix && String(variant.skuSuffix).trim()) {
    return String(variant.skuSuffix).trim();
  }
  const colors = (dictionaries && dictionaries.colors) || [];
  const sizes = (dictionaries && dictionaries.sizes) || [];
  const color = colors.find((c) => c.id === variant.colorId);
  const size = sizes.find((s) => s.id === variant.sizeId);
  const parts = [color && color.name, size && size.name].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : variantId;
}

function buildReportVariantQtySummary(lines, product, dictionaries) {
  const active = (lines || []).filter(
    (l) => (Number(l.quantity) || 0) > 0 || (Number(l.defectiveQuantity) || 0) > 0,
  );
  if (!active.length) {
    return { text: '', show: false, variantCount: 0 };
  }
  const variantCount = new Set(active.map((l) => l.variantId || '')).size;
  const variantLen = ((product && product.variants) || []).length;
  const shouldShow = active.length > 1 || Boolean(active[0] && active[0].variantId) || variantLen > 1;
  if (!shouldShow) {
    return { text: '', show: false, variantCount: Math.max(1, variantCount) };
  }
  const parts = active.map((l) => {
    const qty = Number(l.quantity) || 0;
    const label = resolveReportVariantLabel(product, l.variantId, dictionaries);
    return `${label} ×${qty}`;
  });
  return { text: parts.join(' · '), show: true, variantCount };
}

module.exports = {
  resolveReportVariantLabel,
  buildReportVariantQtySummary,
};
