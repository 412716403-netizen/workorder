const { request } = require('../../utils/request.js');

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

function listPsiRecordsPaginated(params) {
  return request({ path: `/psi/records${buildQs(params)}`, method: 'GET', timeout: 60000 })
    .then(parsePaginatedBody);
}

const MAX_FETCH_PAGES = 40;
const FETCH_PAGE_SIZE = 200;

async function fetchAllPsiRecords(typeOrParams) {
  const base =
    typeof typeOrParams === 'string'
      ? { type: typeOrParams }
      : typeOrParams && typeof typeOrParams === 'object'
        ? typeOrParams
        : {};
  const all = [];
  let page = 1;
  let total = Infinity;
  while (all.length < total && page <= MAX_FETCH_PAGES) {
    const result = await listPsiRecordsPaginated({
      ...base,
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

function createPsiRecordsBatch(records) {
  return request({
    path: '/psi/records/batch',
    method: 'POST',
    data: { records },
  });
}

function replacePsiRecords(deleteIds, newRecords) {
  return request({
    path: '/psi/records/replace',
    method: 'PUT',
    data: { deleteIds, newRecords },
  });
}

function deletePsiRecords(ids) {
  if (!ids || !ids.length) return Promise.resolve();
  if (ids.length === 1) {
    return request({
      path: `/psi/records/${encodeURIComponent(ids[0])}`,
      method: 'DELETE',
    });
  }
  return request({
    path: '/psi/records',
    method: 'DELETE',
    data: { ids },
  });
}

function nextPsiDocNumber(params) {
  const qs = buildQs({
    prefix: params.prefix,
    psiType: params.psiType,
    partnerId: params.partnerId,
    partnerName: params.partnerName,
    legacyPrefixes: (params.legacyPrefixes || []).join(','),
  });
  return request({ path: `/psi/next-doc-number${qs}`, method: 'GET' });
}

function lastPurchasePrices(items) {
  if (!items || !items.length) return Promise.resolve([]);
  return request({
    path: '/psi/last-purchase-prices',
    method: 'POST',
    data: { items },
  }).catch(() => []);
}

module.exports = {
  buildQs,
  listPsiRecordsPaginated,
  fetchAllPsiRecords,
  createPsiRecordsBatch,
  replacePsiRecords,
  deletePsiRecords,
  nextPsiDocNumber,
  lastPurchasePrices,
};
