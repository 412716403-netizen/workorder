/**
 * 产品搜索（含分类自定义字段，对齐 Web utils/productSearchMatch.ts）
 */

const { getProductCategoryCustomFieldEntries } = require('./reportCustomDocField.js');

const MAX_STRING_SCAN = 800;

function appendFlattenedValues(parts, val, depth) {
  if (depth > 10) return;
  if (val == null) return;
  if (typeof val === 'string') {
    if (val.indexOf('data:') === 0) {
      parts.push('[附件]');
      return;
    }
    if (val.length > MAX_STRING_SCAN) return;
    parts.push(val);
    return;
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    parts.push(String(val));
    return;
  }
  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i += 1) {
      appendFlattenedValues(parts, val[i], depth + 1);
    }
    return;
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    for (let i = 0; i < keys.length; i += 1) {
      appendFlattenedValues(parts, val[keys[i]], depth + 1);
    }
  }
}

function buildProductSearchHaystackLower(product, category) {
  const parts = [];
  appendFlattenedValues(parts, product && product.categoryCustomData, 0);
  appendFlattenedValues(parts, product && product.routeReportValues, 0);
  appendFlattenedValues(parts, product && product.routeReportDisplayValues, 0);
  const entries = getProductCategoryCustomFieldEntries(product, category, {
    includeFile: true,
    includeEmpty: false,
  });
  for (let i = 0; i < entries.length; i += 1) {
    parts.push(entries[i].field.label, entries[i].display);
  }
  return parts.filter(Boolean).join('\u0001').toLowerCase();
}

function productMatchesSearchQuery(product, category, qRaw) {
  const q = String(qRaw || '').trim().toLowerCase();
  if (!q) return true;
  const n = String((product && product.name) || '').toLowerCase();
  const s = String((product && product.sku) || '').toLowerCase();
  const d = String((product && product.description) || '').toLowerCase();
  if (n.indexOf(q) >= 0 || s.indexOf(q) >= 0 || d.indexOf(q) >= 0) return true;
  return buildProductSearchHaystackLower(product, category).indexOf(q) >= 0;
}

module.exports = {
  buildProductSearchHaystackLower,
  productMatchesSearchQuery,
};
