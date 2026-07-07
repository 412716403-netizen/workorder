/**
 * 合作单位搜索过滤（对齐 Web SearchablePartnerSelect）
 */

function partnerSearchHaystack(partner) {
  const customParts = Object.values(partner.customData || {}).map((v) => {
    if (v == null || typeof v === 'object') return '';
    return String(v);
  });
  return [partner.name, partner.contact || '', ...customParts].join(' ').toLowerCase();
}

function filterPartners(options, { search = '', activeTab = 'all', onlyCategoryId } = {}) {
  const searchNeedle = String(search).toLowerCase().trim();
  return (options || [])
    .filter((p) => {
      if (onlyCategoryId && p.categoryId !== onlyCategoryId) return false;
      const hay = partnerSearchHaystack(p);
      const matchesSearch = !searchNeedle || hay.includes(searchNeedle);
      const matchesCategory = activeTab === 'all' || p.categoryId === activeTab;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
}

module.exports = {
  filterPartners,
  partnerSearchHaystack,
};
