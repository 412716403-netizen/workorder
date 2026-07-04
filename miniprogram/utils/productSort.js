/**
 * 产品档案排序（对齐 Web utils/productSort.ts）
 * SearchableProductSelect / 产品与 BOM 档案中心：新在前，同时间 id 降序。
 */

function productSortTimeMs(p) {
  const createdAt = p && p.createdAt;
  const updatedAt = p && p.updatedAt;
  const ts = Date.parse(createdAt || updatedAt || '');
  if (Number.isFinite(ts) && ts > 0) return ts;
  const m = /^p-(\d+)-/.exec((p && p.id) || '');
  if (m) {
    const idTs = Number(m[1]);
    if (Number.isFinite(idTs) && idTs > 0) return idTs;
  }
  return 0;
}

function compareProductsArchiveOrder(a, b) {
  const t = productSortTimeMs(b) - productSortTimeMs(a);
  if (t !== 0) return t;
  return String(b.id || '').localeCompare(String(a.id || ''), 'zh-CN');
}

module.exports = {
  productSortTimeMs,
  compareProductsArchiveOrder,
};
