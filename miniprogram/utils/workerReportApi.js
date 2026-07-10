/**
 * 报工 Tab（主包 pages/scan）专用 API，避免跨分包 require。
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
  return request({ path: '/products?all=true', method: 'GET', timeout: 60000 }).catch(() => []);
}

function fetchDictionaries() {
  return request({ path: '/master/dictionaries', method: 'GET', timeout: 60000 }).catch(() => ({}));
}

function fetchNodesAll() {
  return request({ path: '/settings/nodes?all=true', method: 'GET', timeout: 60000 }).catch(() => []);
}

module.exports = {
  listMyReportableTasks,
  listMyReportHistory,
  fetchProductsAll,
  fetchDictionaries,
  fetchNodesAll,
};
