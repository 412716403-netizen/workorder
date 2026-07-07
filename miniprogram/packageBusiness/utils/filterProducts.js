/**
 * 产品搜索过滤（对齐 Web SearchableProductSelect）
 */

const { productMatchesSearchQuery } = require('./productSearchMatch.js');
const { compareProductsArchiveOrder } = require('./productSort.js');

function filterProducts(products, { search = '', categoryId, categories = [] } = {}) {
  const catById = new Map((categories || []).map((c) => [c.id, c]));
  return (products || [])
    .filter((p) => {
      if (categoryId && p.categoryId !== categoryId) return false;
      const category = p.categoryId ? catById.get(p.categoryId) : null;
      return productMatchesSearchQuery(p, category, search);
    })
    .sort(compareProductsArchiveOrder);
}

module.exports = {
  filterProducts,
};
