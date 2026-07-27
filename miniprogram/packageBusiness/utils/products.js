const { PRODUCT_ARCHIVE_ALL, DEFAULT_PAGE_SIZE } = require('../config/products.js');
const { isProductEnabled } = require('./productEnabled.js');
const { productMatchesSearchQuery } = require('../../utils/productSearchMatch.js');
const { compareProductsArchiveOrder } = require('../../utils/productSort.js');
const { mapProductCustomTags } = require('../../utils/reportCustomDocField.js');
const {
  listProductThumbFromProduct,
  DEFAULT_PRODUCT_PLACEHOLDER_ICON,
} = require('../../utils/listProductThumb.js');
const {
  buildPartnerNameById,
  resolveProductPartnerName,
} = require('./productPartnerDisplay.js');

function buildCategoryMap(categories) {
  const map = new Map();
  (categories || []).forEach((c) => map.set(c.id, c));
  return map;
}

function buildCategoryTabs(categories, products, activeCategoryId) {
  const tabs = [{
    id: PRODUCT_ARCHIVE_ALL,
    label: '全部',
    count: (products || []).length,
    active: activeCategoryId === PRODUCT_ARCHIVE_ALL,
  }];
  (categories || []).forEach((cat) => {
    const count = (products || []).filter((p) => p.categoryId === cat.id).length;
    tabs.push({
      id: cat.id,
      label: cat.name,
      count,
      active: activeCategoryId === cat.id,
    });
  });
  return tabs;
}

function filterProducts(products, categories, activeCategoryId, searchQuery, partnerNameById) {
  const categoryMap = buildCategoryMap(categories);
  const nameById = partnerNameById || buildPartnerNameById([]);
  const inCategory = activeCategoryId === PRODUCT_ARCHIVE_ALL
    ? (products || [])
    : (products || []).filter((p) => p.categoryId === activeCategoryId);
  const q = String(searchQuery || '').trim();
  const searched = !q
    ? inCategory
    : inCategory.filter((p) => {
      const cat = categoryMap.get(p.categoryId) || null;
      const partnerName = resolveProductPartnerName(p, cat, nameById);
      return productMatchesSearchQuery(p, cat, q, { partnerName });
    });
  return [...searched].sort(compareProductsArchiveOrder);
}

function paginateList(list, page, pageSize) {
  const size = pageSize || DEFAULT_PAGE_SIZE;
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * size;
  return {
    items: list.slice(start, start + size),
    page: safePage,
    pageSize: size,
    total,
    totalPages,
    hasMore: safePage < totalPages,
  };
}

function formatPriceText(product) {
  const sales = Number(product.salesPrice) || 0;
  const purchase = Number(product.purchasePrice) || 0;
  const display = sales > 0 ? sales : purchase;
  const label = sales > 0 ? '销售' : '采购';
  return {
    displayPrice: display,
    priceText: display > 0 ? `¥${display.toLocaleString()}` : '¥0',
    priceLabel: label,
    showPrice: display > 0,
  };
}

function buildProductListRow(product, category, partnerNameById) {
  const enabled = isProductEnabled(product);
  const thumb = listProductThumbFromProduct(product);
  const price = formatPriceText(product);
  const customTags = mapProductCustomTags(product, category, { includeFile: false }).slice(0, 2);
  const variantCount = ((product && product.variants) || []).length;
  const partnerName = resolveProductPartnerName(
    product,
    category,
    partnerNameById || buildPartnerNameById([]),
  );

  return {
    id: product.id,
    productName: product.name || '',
    productSku: product.sku || '',
    showProductSku: Boolean(
      product.name && product.sku && String(product.name).trim() !== String(product.sku).trim(),
    ),
    productImageUrl: thumb.productImageUrl,
    showProductImage: thumb.showProductImage,
    placeholderIconSrc: thumb.placeholderIconSrc || DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    categoryName: category ? category.name : '',
    showCategory: Boolean(category),
    partnerName: partnerName || '',
    showPartner: Boolean(partnerName),
    variantCountText: String(variantCount),
    ...price,
    enabled,
    showDisabledBadge: !enabled,
    customTags: customTags.map((t) => ({
      id: t.id,
      label: t.label,
      display: String(t.display || '').slice(0, 48),
    })),
    showCustomTags: customTags.length > 0,
  };
}

function buildProductListRows(products, categories, activeCategoryId, searchQuery, page, pageSize, partners) {
  const categoryMap = buildCategoryMap(categories);
  const partnerNameById = buildPartnerNameById(partners);
  const filtered = filterProducts(products, categories, activeCategoryId, searchQuery, partnerNameById);
  const paged = paginateList(filtered, page, pageSize);
  const rows = paged.items.map((p) => {
    const cat = categoryMap.get(p.categoryId);
    return buildProductListRow(p, cat, partnerNameById);
  });
  return {
    ...paged,
    rows,
    filteredTotal: filtered.length,
    categoryTabs: buildCategoryTabs(categories, products, activeCategoryId),
  };
}

function buildCategoryMapPlain(categories) {
  const out = {};
  (categories || []).forEach((c) => { out[c.id] = c; });
  return out;
}

function buildProductMap(products) {
  const out = new Map();
  (products || []).forEach((p) => out.set(p.id, p));
  return out;
}

module.exports = {
  PRODUCT_ARCHIVE_ALL,
  DEFAULT_PAGE_SIZE,
  buildCategoryMap,
  buildCategoryTabs,
  filterProducts,
  paginateList,
  buildProductListRow,
  buildProductListRows,
  buildCategoryMapPlain,
  buildProductMap,
  formatPriceText,
};
