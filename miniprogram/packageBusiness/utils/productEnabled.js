/** 产品启用状态（对齐 Web utils/productEnabled.ts） */

function isProductEnabled(p) {
  return !p || p.enabled !== false;
}

function filterSelectableProducts(products, keepId) {
  return (products || []).filter((p) => isProductEnabled(p) || p.id === keepId);
}

module.exports = {
  isProductEnabled,
  filterSelectableProducts,
};
