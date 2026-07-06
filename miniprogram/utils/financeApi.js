/**
 * 财务记录 API（收款单 / 付款单等）
 */

const { request } = require('./request.js');

function buildQs(params) {
  const parts = [];
  Object.keys(params || {}).forEach((key) => {
    const v = params[key];
    if (v === undefined || v === null || v === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

function parsePaginatedBody(body) {
  if (body && typeof body === 'object' && Array.isArray(body.data)) {
    return {
      data: body.data,
      total: typeof body.total === 'number' ? body.total : body.data.length,
      page: body.page || 1,
      pageSize: body.pageSize || 20,
    };
  }
  if (Array.isArray(body)) {
    return { data: body, total: body.length, page: 1, pageSize: body.length };
  }
  return { data: [], total: 0, page: 1, pageSize: 20 };
}

function listFinanceRecordsPaginated(params) {
  return request({
    path: `/finance/records${buildQs(params)}`,
    method: 'GET',
    timeout: 60000,
  }).then(parsePaginatedBody);
}

const MAX_FETCH_PAGES = 40;
const FETCH_PAGE_SIZE = 200;

async function fetchAllFinanceRecords(params) {
  const all = [];
  let page = 1;
  let total = Infinity;
  while (all.length < total && page <= MAX_FETCH_PAGES) {
    const result = await listFinanceRecordsPaginated({
      ...(params || {}),
      page,
      pageSize: FETCH_PAGE_SIZE,
    });
    const batch = result.data || [];
    all.push(...batch);
    total = typeof result.total === 'number' ? result.total : all.length;
    if (!batch.length || batch.length < FETCH_PAGE_SIZE) break;
    page += 1;
  }
  return all;
}

/** 合作单位对账上期余额（权限 finance:reconciliation:allow） */
function partnerOpeningBalance(params) {
  return request({
    path: `/finance/reconciliation/partner-opening-balance${buildQs(params)}`,
    method: 'GET',
    timeout: 60000,
  }).catch(() => ({ previousBalance: 0 }));
}

function getFinanceRecord(id) {
  return request({
    path: `/finance/records/${encodeURIComponent(id)}`,
    method: 'GET',
  });
}

function createFinanceRecord(body) {
  return request({
    path: '/finance/records',
    method: 'POST',
    data: body,
  });
}

function updateFinanceRecord(id, body) {
  return request({
    path: `/finance/records/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: body,
  });
}

function deleteFinanceRecord(id) {
  return request({
    path: `/finance/records/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

function fetchFinanceCategoriesAll() {
  return request({
    path: '/settings/finance-categories?all=true',
    method: 'GET',
  }).catch(() => []);
}

function fetchFinanceAccountTypesAll() {
  return request({
    path: '/settings/finance-account-types?all=true',
    method: 'GET',
  }).catch(() => []);
}

function fetchFeaturePlugins() {
  return request({
    path: '/dashboard/feature-plugins',
    method: 'GET',
  }).catch(() => ({}));
}

function isFundsAccountEnabled(plugins) {
  return !(plugins && plugins.funds_account === false);
}

function normalizeMasterList(list) {
  if (Array.isArray(list)) return list;
  if (list && Array.isArray(list.data)) return list.data;
  return [];
}

module.exports = {
  listFinanceRecordsPaginated,
  fetchAllFinanceRecords,
  partnerOpeningBalance,
  getFinanceRecord,
  createFinanceRecord,
  updateFinanceRecord,
  deleteFinanceRecord,
  fetchFinanceCategoriesAll,
  fetchFinanceAccountTypesAll,
  fetchFeaturePlugins,
  isFundsAccountEnabled,
  normalizeMasterList,
};
