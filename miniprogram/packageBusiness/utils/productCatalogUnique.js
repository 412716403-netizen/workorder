/** 产品编号租户内唯一（产品名称允许重复；对齐 Web utils/productCatalogUnique.ts） */

const PRODUCT_NAME_TAKEN_MSG = '产品编号在租户内已存在，请更换';
/** @deprecated 产品名称允许重复 */
const PRODUCT_SKU_TAKEN_MSG = '产品名称在租户内已存在，请更换';

function isProductNameTakenInCatalog(catalog, name, excludeProductId) {
  const n = String(name || '').trim();
  if (!n) return false;
  return (catalog || []).some(
    (p) => p.id !== excludeProductId && String(p.name || '').trim() === n,
  );
}

function isDevStyleNameTaken(styles, name, excludeStyleId) {
  const n = String(name || '').trim();
  if (!n) return false;
  return (styles || []).some(
    (s) => s.id !== excludeStyleId && String(s.name || '').trim() === n,
  );
}

function isProductSkuTakenInCatalog() {
  return false;
}

function validateProductCatalogUnique(catalog, opts) {
  if (isProductNameTakenInCatalog(catalog, opts.name, opts.excludeProductId)) {
    return PRODUCT_NAME_TAKEN_MSG;
  }
  if (opts.styles && isDevStyleNameTaken(opts.styles, opts.name, opts.excludeStyleId)) {
    return PRODUCT_NAME_TAKEN_MSG;
  }
  return null;
}

module.exports = {
  PRODUCT_NAME_TAKEN_MSG,
  PRODUCT_SKU_TAKEN_MSG,
  isProductNameTakenInCatalog,
  isDevStyleNameTaken,
  isProductSkuTakenInCatalog,
  validateProductCatalogUnique,
};
