/**
 * 批量扫码列表行展示（对齐 Web utils/scanBatchRowDetail.ts，无称重字段）
 */

function deriveColorSizeSpec(res) {
  const c = (res.colorName || '').trim();
  const s = (res.sizeName || '').trim();
  const v = (res.variantLabel || '').trim();
  if (c || s) {
    return { colorName: c || '—', sizeName: s || '—', specNote: null };
  }
  if (v) {
    return { colorName: '—', sizeName: '—', specNote: v };
  }
  return { colorName: '—', sizeName: '—', specNote: null };
}

function scanItemResultToRowDetail(res) {
  const { colorName, sizeName, specNote } = deriveColorSizeSpec(res);
  return {
    kindLabel: '单品',
    productName: (res.productName || '').trim() || (res.sku || '').trim() || '—',
    codeLabel: (res.serialLabel || '').trim() || null,
    colorName,
    sizeName,
    quantity: 1,
    specNote,
    itemCodeId: res.itemCodeId || null,
    virtualBatchId: res.batchId || null,
    productId: res.productId || null,
    variantId: res.variantId || null,
  };
}

function scanVirtualBatchResultToRowDetail(res) {
  const { colorName, sizeName, specNote } = deriveColorSizeSpec(res);
  return {
    kindLabel: '批次',
    productName: (res.productName || '').trim() || (res.sku || '').trim() || '—',
    codeLabel: (res.serialLabel || '').trim() || null,
    colorName,
    sizeName,
    quantity: Math.max(0, Math.floor(Number(res.quantity || 0))),
    specNote,
    itemCodeId: null,
    virtualBatchId: res.batchId || null,
    productId: res.productId || null,
    variantId: res.variantId || null,
  };
}

function rowDisplayLine(detail) {
  if (!detail) return '—';
  const parts = [
    detail.productName,
    detail.codeLabel,
    detail.specNote || `${detail.colorName} / ${detail.sizeName}`,
    `×${detail.quantity}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

module.exports = {
  scanItemResultToRowDetail,
  scanVirtualBatchResultToRowDetail,
  rowDisplayLine,
};
