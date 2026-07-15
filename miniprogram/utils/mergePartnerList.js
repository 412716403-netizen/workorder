/**
 * 将快捷新建的合作单位合并进页面列表（按 id 去重，按名称排序）。
 */

function mergePartnerIntoList(list, partner) {
  if (!partner || !partner.id) return list || [];
  const arr = (list || []).slice();
  const idx = arr.findIndex((p) => p && p.id === partner.id);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...partner };
    return arr;
  }
  arr.push(partner);
  return arr.sort(
    (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
  );
}

/**
 * 页面监听 searchable-partner-select 的 created 事件。
 * @param {WechatMiniprogram.Page.Instance} page
 * @param {{ detail?: { partner?: object } }} e
 * @param {{ dataKey?: string, cacheKey?: string }} [opts]
 */
function applyPartnerCreatedOnPage(page, e, opts) {
  const dataKey = (opts && opts.dataKey) || 'partners';
  const cacheKey = opts && opts.cacheKey;
  const partner = e && e.detail && e.detail.partner;
  if (!partner || !partner.id || !page) return;
  const prev =
    (cacheKey && page[cacheKey] != null ? page[cacheKey] : null) ||
    page.data[dataKey] ||
    [];
  const merged = mergePartnerIntoList(prev, partner);
  if (cacheKey) page[cacheKey] = merged;
  page.setData({ [dataKey]: merged });
}

module.exports = {
  mergePartnerIntoList,
  applyPartnerCreatedOnPage,
};
