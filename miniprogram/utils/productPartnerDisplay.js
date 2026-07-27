/**
 * 产品关联合作单位名称（对齐 Web utils/productPartnerDisplay.ts）。
 * 仅分类开启 linkPartner 时视为有效。
 * 放主包 utils，供 listProductThumb 等主包模块引用。
 */

function buildPartnerNameById(partners) {
  const map = new Map();
  (partners || []).forEach((p) => {
    if (p && p.id) map.set(p.id, p.name || '');
  });
  return map;
}

function resolveProductPartnerName(product, category, partnerNameById) {
  if (!category || !category.linkPartner) return null;
  const id = String((product && product.supplierId) || '').trim();
  if (!id) return null;
  const name = partnerNameById && partnerNameById.get(id);
  const trimmed = name ? String(name).trim() : '';
  return trimmed || null;
}

module.exports = {
  buildPartnerNameById,
  resolveProductPartnerName,
};
