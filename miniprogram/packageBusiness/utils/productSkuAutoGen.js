/** 产品 SKU 自动生成（对齐 Web utils/productSkuAutoGen.ts） */

const AUTO_SKU_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateAutoProductSku() {
  let prefix = '';
  for (let i = 0; i < 2; i += 1) {
    prefix += AUTO_SKU_LETTERS[Math.floor(Math.random() * AUTO_SKU_LETTERS.length)];
  }
  return `${prefix}${Date.now()}`;
}

function resolveProductSkuForSave(p, catalog) {
  const sku = String((p && p.sku) || '').trim();
  if (sku) return p;
  let candidate = '';
  for (let i = 0; i < 20; i += 1) {
    candidate = generateAutoProductSku();
    const taken = (catalog || []).some(
      (o) => o.id !== p.id && String(o.sku || '').trim() === candidate,
    );
    if (!taken) break;
  }
  return { ...p, sku: candidate };
}

module.exports = {
  AUTO_SKU_LETTERS,
  generateAutoProductSku,
  resolveProductSkuForSave,
};
