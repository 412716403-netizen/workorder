/**
 * 报工 Tab（主包 pages/scan）专用 API，避免跨分包 require。
 * 主数据走短 TTL 缓存，减轻开发者工具反复 onShow 时的卡顿。
 */

const { request } = require('./request.js');
const { cachedFetch } = require('./masterDataCache.js');

const MASTER_TTL_MS = 90 * 1000;

function buildQs(params) {
  const parts = [];
  Object.keys(params || {}).forEach((key) => {
    const v = params[key];
    if (v === undefined || v === null || v === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

function listMyReportableTasks(params) {
  return request({
    path: `/orders/my-reportable-tasks${buildQs(params)}`,
    method: 'GET',
    timeout: 60000,
  });
}

function listMyReportHistory(params) {
  return request({
    path: `/orders/my-report-history${buildQs(params)}`,
    method: 'GET',
    timeout: 60000,
  });
}

function fetchProductsAll() {
  return cachedFetch(
    'products:all',
    () => request({ path: '/products?all=true&lite=true', method: 'GET', timeout: 60000 }).catch(() => []),
    MASTER_TTL_MS,
  );
}

function fetchDictionaries() {
  return cachedFetch(
    'dictionaries',
    () => request({ path: '/master/dictionaries', method: 'GET', timeout: 60000 }).catch(() => ({})),
    MASTER_TTL_MS,
  );
}

function fetchNodesAll() {
  return cachedFetch(
    'nodes:all',
    () => request({ path: '/settings/nodes?all=true', method: 'GET', timeout: 60000 }).catch(() => []),
    MASTER_TTL_MS,
  );
}

function fetchCategoriesAll() {
  return cachedFetch(
    'categories:all',
    () => request({ path: '/settings/categories?all=true', method: 'GET', timeout: 60000 }).catch(() => []),
    MASTER_TTL_MS,
  );
}

function fetchTenantConfig() {
  return cachedFetch(
    'tenant:config',
    () => request({ path: '/settings/config', method: 'GET', timeout: 60000 }).catch(() => ({})),
    MASTER_TTL_MS,
  );
}

module.exports = {
  listMyReportableTasks,
  listMyReportHistory,
  fetchProductsAll,
  fetchDictionaries,
  fetchNodesAll,
  fetchCategoriesAll,
  fetchTenantConfig,
};
