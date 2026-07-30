const { DevStyleStatus } = require('./devStyleConstants.js');
const {
  resolveDevStyleCustomerName,
  getDevSampleSidebarProgress,
  isDevStylePublishedForDisplay,
  resolveDevStyleThumb,
} = require('./devStyleDisplay.js');
const { listProductMetaFields, buildPartnerNameById } = require('../../utils/listProductThumb.js');

const DEV_STYLE_LIST_FILTERS_DEFAULT = {
  stageName: 'all',
  syncStatus: 'all',
};

function styleHasStageInProgress(style, stageName) {
  if (!stageName || stageName === 'all') return true;
  return (style.samples || []).some((sample) =>
    (sample.stages || []).some((st) => st.name === stageName && st.status === 'in_progress'),
  );
}

function styleMatchesSyncFilter(style, syncStatus) {
  if (syncStatus === 'all') return true;
  if (syncStatus === 'synced') return style.status === DevStyleStatus.PUBLISHED;
  if (syncStatus === 'unsynced') return style.status === DevStyleStatus.ARCHIVED;
  return true;
}

function styleMatchesDevListTab(style, activeTab) {
  if (activeTab === 'archived') {
    return (
      style.status === DevStyleStatus.ARCHIVED || style.status === DevStyleStatus.PUBLISHED
    );
  }
  return style.status === DevStyleStatus.DEVELOPING;
}

function styleMatchesDevSearch(style, searchQuery, partners) {
  const q = String(searchQuery || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const customer = String(resolveDevStyleCustomerName(style, partners) || '').toLowerCase();
  return (
    String(style.code || '')
      .toLowerCase()
      .includes(q) ||
    String(style.name || '')
      .toLowerCase()
      .includes(q) ||
    customer.includes(q)
  );
}

function filterDevStyles(styles, params) {
  const activeTab = (params && params.activeTab) || 'developing';
  const searchQuery = (params && params.searchQuery) || '';
  const filters = (params && params.filters) || DEV_STYLE_LIST_FILTERS_DEFAULT;
  const partners = params && params.partners;
  return (styles || []).filter((s) => {
    if (!styleMatchesDevListTab(s, activeTab)) return false;
    if (activeTab === 'developing' && !styleHasStageInProgress(s, filters.stageName)) return false;
    if (activeTab === 'archived' && !styleMatchesSyncFilter(s, filters.syncStatus)) return false;
    return styleMatchesDevSearch(s, searchQuery, partners);
  });
}

function hasActiveDevStyleListFilter(filters, tab) {
  const f = filters || DEV_STYLE_LIST_FILTERS_DEFAULT;
  if (tab === 'developing') return f.stageName !== 'all';
  return f.syncStatus !== 'all';
}

function collectDevStageFilterOptions(templates, styles) {
  const ordered = [];
  const seen = new Set();
  const sortedTemplates = [...(templates || [])].sort(
    (a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), 'zh-CN'),
  );
  sortedTemplates.forEach((t) => {
    if (!seen.has(t.name)) {
      seen.add(t.name);
      ordered.push(t.name);
    }
  });
  (styles || []).forEach((style) => {
    (style.samples || []).forEach((sample) => {
      (sample.stages || []).forEach((st) => {
        if (!seen.has(st.name)) {
          seen.add(st.name);
          ordered.push(st.name);
        }
      });
    });
  });
  return ordered;
}

function sortDevStyles(styles, sortMode, partners) {
  const list = [...(styles || [])];
  if (sortMode === 'customer') {
    list.sort((a, b) => {
      const ca = resolveDevStyleCustomerName(a, partners) || '未指定客户';
      const cb = resolveDevStyleCustomerName(b, partners) || '未指定客户';
      const cmp = ca.localeCompare(cb, 'zh-CN');
      if (cmp !== 0) return cmp;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    return list;
  }
  list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return list;
}

function buildDevStyleListRows(styles, opts) {
  const partners = Array.isArray(opts) ? opts : (opts && opts.partners) || [];
  const categoryMap = (!Array.isArray(opts) && opts && opts.categoryMap) || new Map();
  const partnerNameById =
    (!Array.isArray(opts) && opts && opts.partnerNameById) || buildPartnerNameById(partners);

  return (styles || []).map((style) => {
    const customerName = resolveDevStyleCustomerName(style, partners) || '';
    const samples = style.samples || [];
    const progressParts = samples.map((sample) => {
      const p = getDevSampleSidebarProgress(sample);
      return {
        sampleId: sample.id,
        sampleName: sample.name || '',
        kind: p.kind,
        label: p.label,
      };
    });
    const thumb = resolveDevStyleThumb(style);
    // DevStyle：name=产品编号，code=产品名称（款号）
    const code = String(style.name || '').trim();
    const title = String(style.code || '').trim();
    const productName = code || title || '未命名款式';
    const showProductSku = !!(title && code && title !== code);
    const category = style.categoryId ? categoryMap.get(style.categoryId) || null : null;
    const meta = listProductMetaFields(style, category, partnerNameById, { maxTags: 4 });
    return {
      id: style.id,
      productName,
      productSku: showProductSku ? title : '',
      showProductSku,
      productImageUrl: thumb,
      showProductImage: !!thumb,
      placeholderIconSrc: '/assets/icons/boxes.png',
      customerName,
      showCustomer: !!customerName,
      partnerName: meta.partnerName,
      showPartner: meta.showPartner,
      productCustomTags: meta.productCustomTags,
      showProductMeta: meta.showProductMeta,
      status: style.status,
      statusLabel:
        style.status === DevStyleStatus.PUBLISHED
          ? '已发布'
          : style.status === DevStyleStatus.ARCHIVED
            ? '已归档'
            : '',
      // 还原至开发中的款式仍保留「已发布」标识
      showPublishedBadge: isDevStylePublishedForDisplay(style),
      progressParts,
      updatedAt: style.updatedAt,
    };
  });
}

module.exports = {
  DEV_STYLE_LIST_FILTERS_DEFAULT,
  filterDevStyles,
  hasActiveDevStyleListFilter,
  collectDevStageFilterOptions,
  sortDevStyles,
  buildDevStyleListRows,
  styleMatchesDevListTab,
};
