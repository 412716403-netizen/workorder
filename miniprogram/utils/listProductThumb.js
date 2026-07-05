/**
 * 列表/流水/详情产品缩略图（小程序列表默认带图约定）
 *
 * 无产品图时占位图标与工单中心（production-orders）一致，新增单据/流水请复用本模块。
 */

/** 与工单中心列表 `productionOrders.js` 一致 */
const DEFAULT_PRODUCT_PLACEHOLDER_ICON = '/assets/icons/clipboard-list.png';

function listProductThumbFromProduct(product, opts) {
  const placeholderIconSrc = (opts && opts.placeholderIconSrc) || DEFAULT_PRODUCT_PLACEHOLDER_ICON;
  const productImageUrl = product && product.imageUrl ? String(product.imageUrl).trim() : '';
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
  listProductThumbFromProduct,
  listProductThumbFromUrl,
};
