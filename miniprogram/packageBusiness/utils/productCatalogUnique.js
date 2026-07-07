/** 产品名称/SKU 租户内唯一性（对齐 Web utils/productCatalogUnique.ts） */

const PRODUCT_NAME_TAKEN_MSG = '产品名称在租户内已存在，请更换';
const PRODUCT_SKU_TAKEN_MSG = '产品编号在租户内已存在，请更换';

function isProductNameTakenInCatalog(catalog, name, excludeProductId) {
  const n = String(name || '').trim();
  if (!n) return false;
  return (catalog || []).some(
    (p) => p.id !== excludeProductId && String(p.name || '').trim() === n,
  );
}

function isProductSkuTakenInCatalog(catalog, sku, excludeProductId) {
  const s = String(sku || '').trim();
  if (!s) return false;
  return (catalog || []).some(
    (p) => p.id !== excludeProductId && String(p.sku || '').trim() === s,
  );
}

function validateProductCatalogUnique(catalog, opts) {
  if (isProductNameTakenInCatalog(catalog, opts.name, opts.excludeProductId)) {
    return PRODUCT_NAME_TAKEN_MSG;
  }
  if (isProductSkuTakenInCatalog(catalog, opts.sku, opts.excludeProductId)) {
    return PRODUCT_SKU_TAKEN_MSG;
  }
  return null;
}

module.exports = {
  PRODUCT_NAME_TAKEN_MSG,
  PRODUCT_SKU_TAKEN_MSG,
  isProductNameTakenInCatalog,
  isProductSkuTakenInCatalog,
  validateProductCatalogUnique,
};
