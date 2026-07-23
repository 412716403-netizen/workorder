/** 产品名称(sku) 保存前规范化（对齐 Web utils/productSkuAutoGen.ts：选填、不自动生成） */

const AUTO_SKU_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** @deprecated 产品名称不再自动生成 */
function generateAutoProductSku() {
  let prefix = '';
  for (let i = 0; i < 2; i += 1) {
    prefix += AUTO_SKU_LETTERS[Math.floor(Math.random() * AUTO_SKU_LETTERS.length)];
  }
  return `${prefix}${Date.now()}`;
}

function resolveProductSkuForSave(p, _catalog) {
  const sku = String((p && p.sku) != null ? p.sku : '').trim();
  if (p && p.sku === sku) return p;
  return { ...p, sku };
}

module.exports = {
  AUTO_SKU_LETTERS,
  generateAutoProductSku,
  resolveProductSkuForSave,
};
