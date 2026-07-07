const { LIST_ROUTES } = require('./saveNavigation.js');

/** @typedef {'categories'|'partner_categories'|'nodes'|'warehouses'|'finance_categories'} SettingsArchiveTabId */

/** @type {Record<SettingsArchiveTabId, { permBase: string; listRoute: string; apiKey: string; entityLabel: string; defaultCreate: Record<string, unknown> }>} */
const ARCHIVE_TAB_META = {
  categories: {
    permBase: 'settings:categories',
    listRoute: LIST_ROUTES.SETTINGS_CATEGORIES,
    apiKey: 'categories',
    entityLabel: '产品分类',
    defaultCreate: {
      name: '',
      color: 'bg-indigo-600',
      hasProcess: false,
      hasSalesPrice: false,
      hasPurchasePrice: false,
      linkPartner: false,
      hasColorSize: false,
      hasBatchManagement: false,
      customFields: [],
    },
  },
  partner_categories: {
    permBase: 'settings:partner_categories',
    listRoute: LIST_ROUTES.SETTINGS_PARTNER_CATEGORIES,
    apiKey: 'partnerCategories',
    entityLabel: '合作单位分类',
    defaultCreate: { name: '', customFields: [] },
  },
  nodes: {
    permBase: 'settings:nodes',
    listRoute: LIST_ROUTES.SETTINGS_NODES,
    apiKey: 'nodes',
    entityLabel: '工序节点',
    defaultCreate: {
      name: '',
      reportTemplate: [],
      reportDisplayTemplate: [],
      hasBOM: false,
      enableAssignment: false,
      enableWorkerAssignment: false,
      enableEquipmentAssignment: false,
      enableEquipmentOnReport: false,
      enablePieceRate: false,
      allowOutsource: false,
      allowOutOfSequence: false,
      enableWeightOnReport: false,
      enableScanWeighing: false,
    },
  },
  warehouses: {
    permBase: 'settings:warehouses',
    listRoute: LIST_ROUTES.SETTINGS_WAREHOUSES,
    apiKey: 'warehouses',
    entityLabel: '仓库',
    defaultCreate: { name: '' },
  },
  finance_categories: {
    permBase: 'settings:finance_categories',
    listRoute: LIST_ROUTES.SETTINGS_FINANCE_CATEGORIES,
    apiKey: 'financeCategories',
    entityLabel: '收付款类型',
    defaultCreate: {
      kind: 'RECEIPT',
      name: '',
      linkPartner: false,
      selectPaymentAccount: false,
      linkWorker: false,
      linkProduct: false,
      customFields: [],
    },
  },
};

const ARCHIVE_TAB_IDS = Object.keys(ARCHIVE_TAB_META);

function getArchiveTabMeta(tabId) {
  return ARCHIVE_TAB_META[tabId] || null;
}

function isArchiveTabId(tabId) {
  return ARCHIVE_TAB_IDS.includes(tabId);
}

function archiveListSubtitle(item, tabId) {
  if (tabId === 'finance_categories') {
    return item.kind === 'PAYMENT' ? '付款单' : '收款单';
  }
  if (item.code) return String(item.code);
  return '';
}

function buildArchiveListRows(list, tabId, usedIds) {
  return (list || []).map((item) => ({
    id: item.id,
    name: item.name || item.title || '未命名',
    subtitle: archiveListSubtitle(item, tabId),
    inUse: usedIds ? usedIds.has(item.id) : false,
    raw: item,
  }));
}

function filterArchiveListByKeyword(rows, keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const name = String(row.name || '').toLowerCase();
    const sub = String(row.subtitle || '').toLowerCase();
    return name.includes(q) || sub.includes(q);
  });
}

module.exports = {
  ARCHIVE_TAB_META,
  ARCHIVE_TAB_IDS,
  getArchiveTabMeta,
  isArchiveTabId,
  archiveListSubtitle,
  buildArchiveListRows,
  filterArchiveListByKeyword,
};
