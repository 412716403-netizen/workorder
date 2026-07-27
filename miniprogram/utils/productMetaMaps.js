/**
 * 列表页产品元信息主数据装配（产品 / 分类 / 合作单位三张表）。
 *
 * 列表要展示「产品编号 + 名称 + 合作单位 + 分类自定义字段」时，
 * 需要 productMap + categoryMap + partnerNameById 三件套，
 * 这里统一装配，避免各页各写一遍且写法不一。
 *
 * 展示口径见 utils/listProductThumb.js。
 */

const { normalizeListBody } = require('./listResponse.js');
const { buildPartnerNameById } = require('./productPartnerDisplay.js');

function buildIdMap(list) {
  const map = new Map();
  normalizeListBody(list).forEach((item) => {
    if (item && item.id) map.set(String(item.id), item);
  });
  return map;
}

const buildProductMap = buildIdMap;
const buildCategoryMap = buildIdMap;

/**
 * 已有原始主数据时的同步装配。
 * @param {{ products?: unknown, categories?: unknown, partners?: unknown }} raw
 */
function buildProductMetaMaps(raw) {
  const { products, categories, partners } = raw || {};
  return {
    productMap: buildProductMap(products),
    categoryMap: buildCategoryMap(categories),
    partnerNameById: buildPartnerNameById(normalizeListBody(partners)),
  };
}

/**
 * 列表页 bootstrap 用：并发拉取并装配。三个请求都带 90s 缓存，失败降级为空表。
 * @param {{ withProducts?: boolean }} [options] 已自行拉过产品的页面传 { withProducts: false }
 * @returns {Promise<{ products: unknown[], categories: unknown[], partners: unknown[],
 *   productMap: Map<string, any>, categoryMap: Map<string, any>, partnerNameById: Map<string, string> }>}
 */
function loadProductMetaMaps(options) {
  const withProducts = !(options && options.withProducts === false);
  const {
    fetchProductsAll,
    fetchCategoriesAll,
    fetchPartnersAll,
  } = require('./planApi.js');
  return Promise.all([
    withProducts ? fetchProductsAll().catch(() => []) : Promise.resolve([]),
    fetchCategoriesAll().catch(() => []),
    fetchPartnersAll().catch(() => []),
  ]).then(([productsRaw, categoriesRaw, partnersRaw]) => {
    const products = normalizeListBody(productsRaw);
    const categories = normalizeListBody(categoriesRaw);
    const partners = normalizeListBody(partnersRaw);
    return {
      products,
      categories,
      partners,
      ...buildProductMetaMaps({ products, categories, partners }),
    };
  });
}

module.exports = {
  buildProductMap,
  buildCategoryMap,
  buildPartnerNameById,
  buildProductMetaMaps,
  loadProductMetaMaps,
};
