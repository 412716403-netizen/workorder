const {
  DICT_KIND_ALL,
  DEFAULT_PAGE_SIZE,
  DICT_KINDS,
  DICT_KIND_LABEL,
} = require('../config/dictionaries.js');
const { paginateList } = require('./partners.js');

const KIND_ORDER = { color: 0, size: 1, unit: 2 };

function flattenDictionaryRows(dictionaries) {
  const colors = (dictionaries && dictionaries.colors) || [];
  const sizes = (dictionaries && dictionaries.sizes) || [];
  const units = (dictionaries && dictionaries.units) || [];
  return [
    ...colors.map((c) => ({
      id: c.id,
      kind: 'color',
      name: c.name || '',
      value: c.value != null ? String(c.value) : '',
    })),
    ...sizes.map((s) => ({
      id: s.id,
      kind: 'size',
      name: s.name || '',
      value: s.value != null ? String(s.value) : '',
    })),
    ...units.map((u) => ({
      id: u.id,
      kind: 'unit',
      name: u.name || '',
      value: u.value != null ? String(u.value) : '',
    })),
  ];
}

/**
 * 对齐 Web utils/basicInfoFilters.ts filterAndSortDictionaryRows
 */
function filterAndSortDictionaryRows(rows, options) {
  const kindFilter = (options && options.kindFilter) || DICT_KIND_ALL;
  const keyword = String((options && options.keyword) || '').trim().toLowerCase();
  const byKind = kindFilter === DICT_KIND_ALL || kindFilter === 'all'
    ? rows
    : rows.filter((r) => r.kind === kindFilter);
  const bySearch = !keyword
    ? byKind
    : byKind.filter((r) => r.name.toLowerCase().includes(keyword));
  return [...bySearch].sort((a, b) => {
    const d = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

function countByKind(dictionaries) {
  const colors = (dictionaries && dictionaries.colors) || [];
  const sizes = (dictionaries && dictionaries.sizes) || [];
  const units = (dictionaries && dictionaries.units) || [];
  return {
    all: colors.length + sizes.length + units.length,
    color: colors.length,
    size: sizes.length,
    unit: units.length,
  };
}

function buildKindTabs(dictionaries, activeKind) {
  const counts = countByKind(dictionaries);
  const tabs = [{
    id: DICT_KIND_ALL,
    label: '全部',
    count: counts.all,
    active: activeKind === DICT_KIND_ALL,
  }];
  DICT_KINDS.forEach((k) => {
    tabs.push({
      id: k.id,
      label: k.label,
      count: counts[k.id] || 0,
      active: activeKind === k.id,
    });
  });
  return tabs;
}

function buildDictionaryListRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: DICT_KIND_LABEL[row.kind] || row.kind,
    name: row.name || '',
  };
}

function buildDictionaryListRows(dictionaries, activeKind, searchQuery, page, pageSize) {
  const allRows = flattenDictionaryRows(dictionaries);
  const filtered = filterAndSortDictionaryRows(allRows, {
    kindFilter: activeKind,
    keyword: searchQuery,
  });
  const paged = paginateList(filtered, page, pageSize);
  const rows = paged.items.map(buildDictionaryListRow);
  return {
    ...paged,
    rows,
    filteredTotal: filtered.length,
    kindTabs: buildKindTabs(dictionaries, activeKind),
  };
}

function findDictionaryItemById(dictionaries, id) {
  const rows = flattenDictionaryRows(dictionaries);
  return rows.find((r) => r.id === id) || null;
}

function listItemsByKind(dictionaries, kind) {
  if (kind === 'color') return (dictionaries && dictionaries.colors) || [];
  if (kind === 'size') return (dictionaries && dictionaries.sizes) || [];
  if (kind === 'unit') return (dictionaries && dictionaries.units) || [];
  return [];
}

function hasDuplicateName(dictionaries, kind, name, excludeId) {
  const val = String(name || '').trim();
  if (!val) return false;
  return listItemsByKind(dictionaries, kind).some(
    (item) => item.id !== excludeId && String(item.name || '').trim() === val,
  );
}

module.exports = {
  DICT_KIND_ALL,
  DEFAULT_PAGE_SIZE,
  DICT_KINDS,
  DICT_KIND_LABEL,
  flattenDictionaryRows,
  filterAndSortDictionaryRows,
  buildKindTabs,
  buildDictionaryListRow,
  buildDictionaryListRows,
  findDictionaryItemById,
  hasDuplicateName,
};
