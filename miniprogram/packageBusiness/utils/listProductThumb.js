/**
 * 列表/流水/详情产品缩略图（小程序列表默认带图约定）
 *
 * 无产品图时占位图标与工单中心（production-orders）一致，新增单据/流水请复用本模块。
 * 产品名称 + 编号展示约定见 listProductNameSkuFields / listProductDisplayFields。
 */

/** 与工单中心列表 `productionOrders.js` 一致 */
const DEFAULT_PRODUCT_PLACEHOLDER_ICON = '/assets/icons/clipboard-list.png';

/** 产品名称 + 编号（与 productionPlans.productNameSkuParts 口径一致） */
function productNameSkuParts(product) {
  if (!product) return { name: '—', sku: '', showSku: false };
  const name = product.name || product.sku || '—';
  const sku = product.sku || '';
  return {
    name,
    sku,
    showSku: Boolean(sku && product.name),
  };
}

/**
 * 产品名称 + 编号三件套（对齐报工流水 production-order-report-history）
 * @param {object|null} product
 * @param {{ name?: string, sku?: string, productName?: string, productSku?: string }} [fallback]
 */
function listProductNameSkuFields(product, fallback = {}) {
  const fbName = fallback.name || fallback.productName || '';
  const fbSku = fallback.sku || fallback.productSku || '';
  if (product) {
    const parts = productNameSkuParts(product);
    const name = parts.name || fbName || '—';
    const sku = parts.sku || fbSku || '';
    return {
      productName: name,
      productSku: sku,
      showProductSku: parts.showSku || Boolean(sku && name && sku !== name),
    };
  }
  const name = fbName || fbSku || '—';
  const sku = fbSku || '';
  return {
    productName: name,
    productSku: sku,
    showProductSku: Boolean(sku && name && sku !== name),
  };
}

function listProductNameSkuFromMap(productMap, productId, fallback = {}) {
  const product = productMap && productId ? productMap.get(productId) : null;
  return listProductNameSkuFields(product, fallback);
}

/** 列表行常用：缩略图 + 名称编号三件套 */
function listProductDisplayFields(product, fallback = {}) {
  return {
    ...listProductNameSkuFields(product, fallback),
    ...listProductThumbFromProduct(product),
  };
}

function listProductDisplayFieldsFromMap(productMap, productId, fallback = {}) {
  const product = productMap && productId ? productMap.get(productId) : null;
  return listProductDisplayFields(product, fallback);
}

/** 列表取图：优先 imageThumb（lite），回退 imageUrl */
function productImageSrc(product) {
  if (!product) return '';
  const thumb = product.imageThumb ? String(product.imageThumb).trim() : '';
  if (thumb) return thumb;
  return product.imageUrl ? String(product.imageUrl).trim() : '';
}

function listProductThumbFromProduct(product, opts) {
  const placeholderIconSrc = (opts && opts.placeholderIconSrc) || DEFAULT_PRODUCT_PLACEHOLDER_ICON;
  const productImageUrl = productImageSrc(product);
  return {
    productId: (product && product.id) || '',
    productImageUrl,
    showProductImage: Boolean(productImageUrl),
    placeholderIconSrc,
  };
}

function listProductThumbFromUrl(imageUrl, opts) {
  const placeholderIconSrc = (opts && opts.placeholderIconSrc) || DEFAULT_PRODUCT_PLACEHOLDER_ICON;
  const productImageUrl = imageUrl ? String(imageUrl).trim() : '';
  return {
    productImageUrl,
    showProductImage: Boolean(productImageUrl),
    placeholderIconSrc,
  };
}

module.exports = {
  DEFAULT_PRODUCT_PLACEHOLDER_ICON,
  productImageSrc,
  productNameSkuParts,
  listProductNameSkuFields,
  listProductNameSkuFromMap,
  listProductDisplayFields,
  listProductDisplayFieldsFromMap,
  listProductThumbFromProduct,
  listProductThumbFromUrl,
};
