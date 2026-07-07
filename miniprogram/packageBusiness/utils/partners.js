const { PARTNER_ARCHIVE_ALL, DEFAULT_PAGE_SIZE } = require('../config/partners.js');
const { filterPartners } = require('./filterPartners.js');
const { formatPartnerListNo, getPartnerPhoneDisplay } = require('./partnerForm.js');

function buildCategoryMap(categories) {
  const map = new Map();
  (categories || []).forEach((c) => map.set(c.id, c));
  return map;
}

function buildCategoryTabs(categories, partners, activeCategoryId) {
  const tabs = [{
    id: PARTNER_ARCHIVE_ALL,
    label: '全部单位',
    count: (partners || []).length,
    active: activeCategoryId === PARTNER_ARCHIVE_ALL,
  }];
  (categories || []).forEach((cat) => {
    const count = (partners || []).filter((p) => p.categoryId === cat.id).length;
    tabs.push({
      id: cat.id,
      label: cat.name,
      count,
      active: activeCategoryId === cat.id,
    });
  });
  return tabs;
}

function filterPartnersForArchive(partners, activeCategoryId, searchQuery) {
  const activeTab = activeCategoryId === PARTNER_ARCHIVE_ALL ? 'all' : activeCategoryId;
  return filterPartners(partners, { search: searchQuery, activeTab });
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

function buildPartnerListRow(partner, category) {
  const contact = (partner.contact || '').trim();
  const phoneDisplay = getPartnerPhoneDisplay(partner, category);
  return {
    id: partner.id,
    listNoText: formatPartnerListNo(partner.partnerListNo),
    name: partner.name || '',
    contact: contact || '—',
    showContact: Boolean(contact),
    phoneDisplay,
    showPhone: phoneDisplay !== '—',
    categoryName: category ? category.name : '',
    showCategory: Boolean(category),
    hasCollab: Boolean(partner.collaborationTenantId),
    collabText: partner.collaborationTenantId ? '已关联' : '',
  };
}

function buildPartnerListRows(partners, categories, activeCategoryId, searchQuery, page, pageSize) {
  const categoryMap = buildCategoryMap(categories);
  const filtered = filterPartnersForArchive(partners, activeCategoryId, searchQuery);
  const paged = paginateList(filtered, page, pageSize);
  const rows = paged.items.map((p) => {
    const cat = categoryMap.get(p.categoryId);
    return buildPartnerListRow(p, cat);
  });
  return {
    ...paged,
    rows,
    filteredTotal: filtered.length,
    categoryTabs: buildCategoryTabs(categories, partners, activeCategoryId),
  };
}

module.exports = {
  PARTNER_ARCHIVE_ALL,
  DEFAULT_PAGE_SIZE,
  buildCategoryMap,
  buildCategoryTabs,
  filterPartnersForArchive,
  paginateList,
  buildPartnerListRow,
  buildPartnerListRows,
};
