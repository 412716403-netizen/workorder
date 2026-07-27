/**
 * 列表/流水/详情产品缩略图（小程序列表默认带图约定）
 *
 * 列表标题口径（对齐设计稿）：
 * - 主标题 productName = 产品编号（name），无编号时退回名称（sku）
 * - 副标题 productSku = 产品名称（sku），仅当编号与名称皆有且不同时展示
 *
 * 产品编号 + 名称原始拆分见 productNameSkuParts（name=编号, sku=名称）。
 */

const { mapProductCustomTags } = require('./reportCustomDocField.js');
const {
  buildPartnerNameById,
  resolveProductPartnerName,
} = require('./productPartnerDisplay.js');

/** 与工单中心列表 `productionOrders.js` 一致 */
const DEFAULT_PRODUCT_PLACEHOLDER_ICON = '/assets/icons/clipboard-list.png';

/**
 * 原始字段拆分：name=产品编号，sku=产品名称（与 Product 字段一致）
 * @returns {{ name: string, sku: string, showSku: boolean }}
 */
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
 * 列表展示三件套：主标题=产品编号，副标题=产品名称
 * @param {object|null} product
 * @param {{ name?: string, sku?: string, productName?: string, productSku?: string }} [fallback]
 *   fallback.name / productName 视为编号；fallback.sku / productSku 视为名称
 */
function listProductNameSkuFields(product, fallback = {}) {
  const code = String(
    (product && product.name) || fallback.name || fallback.productName || '',
  ).trim();
  const title = String(
    (product && product.sku) || fallback.sku || fallback.productSku || '',
  ).trim();
  if (code && title && code !== title) {
    return { productName: code, productSku: title, showProductSku: true };
  }
  if (code) return { productName: code, productSku: '', showProductSku: false };
  if (title) return { productName: title, productSku: '', showProductSku: false };
  return { productName: '—', productSku: '', showProductSku: false };
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

/**
 * 列表「自定义内容」行：合作单位 + 分类扩展字段（对齐 Web ProductListMetaTags）
 * @returns {{
 *   partnerName: string,
 *   showPartner: boolean,
 *   productCustomTags: { id: string, label: string, display: string }[],
 *   showProductCustomTags: boolean,
 *   showProductMeta: boolean,
 * }}
 */
function listProductMetaFields(product, category, partnerNameById, options) {
  const maxTags = options && typeof options.maxTags === 'number' ? options.maxTags : 6;
  const partnerName =
    resolveProductPartnerName(
      product,
      category,
      partnerNameById || buildPartnerNameById([]),
    ) || '';
  const customTags = mapProductCustomTags(product, category, { includeFile: false })
    .slice(0, maxTags)
    .map((t) => ({
      id: t.id,
      label: t.label,
      display: String(t.display || '').slice(0, 48),
    }));
  return {
    partnerName,
    showPartner: Boolean(partnerName),
    productCustomTags: customTags,
    showProductCustomTags: customTags.length > 0,
    showProductMeta: Boolean(partnerName) || customTags.length > 0,
  };
}

function listProductMetaFieldsFromMaps(product, categoryMap, partnerNameById, options) {
  const category =
    product && product.categoryId && categoryMap
      ? categoryMap.get(product.categoryId) || null
      : null;
  return listProductMetaFields(product, category, partnerNameById, options);
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

function listProductThumbFromUrl(url, opts) {
  const placeholderIconSrc = (opts && opts.placeholderIconSrc) || DEFAULT_PRODUCT_PLACEHOLDER_ICON;
  const productImageUrl = url ? String(url).trim() : '';
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
  listProductMetaFields,
  listProductMetaFieldsFromMaps,
  listProductThumbFromProduct,
  listProductThumbFromUrl,
  buildPartnerNameById,
};
