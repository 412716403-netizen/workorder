const { request } = require('./request.js');
const { createMilestoneReport } = require('./scanApi.js');
const { normalizeListBody } = require('./listResponse.js');

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

function listOrdersPaginated(params) {
  return request({ path: `/orders${buildQs(params)}`, method: 'GET', timeout: 60000 })
    .then(parsePaginatedBody);
}

function getOrder(id) {
  return request({ path: `/orders/${encodeURIComponent(id)}`, method: 'GET', timeout: 60000 });
}

function updateOrder(id, body) {
  return request({
    path: `/orders/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: body,
  });
}

function updateOrderDispatchStatus(id, status) {
  return request({
    path: `/orders/${encodeURIComponent(id)}/dispatch-status`,
    method: 'PATCH',
    data: { status },
  });
}

function getOrderReportable(id) {
  return request({ path: `/orders/${encodeURIComponent(id)}/reportable`, method: 'GET' });
}

function createOrderReport(orderId, milestoneId, body) {
  return createMilestoneReport(orderId, milestoneId, body);
}

function listReportHistory(params) {
  return request({ path: `/orders/report-history${buildQs(params)}`, method: 'GET', timeout: 60000 })
    .catch(() => ({ orderReports: [], productReports: [] }));
}

function listProductProgressAll() {
  return request({ path: '/orders/product-progress?all=true', method: 'GET', timeout: 60000 })
    .catch(() => []);
}

function createProductReport(body) {
  return request({ path: '/orders/product-progress/report', method: 'POST', data: body });
}

function fetchProductionRecords(params) {
  return request({
    path: `/production/records${buildQs(params)}`,
    method: 'GET',
    timeout: 60000,
  }).catch(() => []);
}

function createProductionRecord(body) {
  return request({ path: '/production/records', method: 'POST', data: body });
}

function createProductionRecordBatch(records) {
  return request({
    path: '/production/records/batch',
    method: 'POST',
    data: { records },
    timeout: 60000,
  });
}

function updateProductionRecord(id, body) {
  return request({
    path: `/production/records/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: body,
  });
}

function deleteProductionRecord(id) {
  return request({
    path: `/production/records/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

function fetchWarehousesAll() {
  return request({ path: '/settings/warehouses?all=true', method: 'GET' }).catch(() => []);
}

function fetchTenantConfig() {
  return request({ path: '/settings/config', method: 'GET', timeout: 30000 }).catch((err) => {
    if (err && err.statusCode === 401) throw err;
    return {};
  });
}

function fetchProductsAll() {
  return request({ path: '/products?all=true', method: 'GET', timeout: 60000 }).catch(() => []);
}

function fetchCategoriesAll() {
  return request({ path: '/settings/categories?all=true', method: 'GET' }).catch(() => []);
}

function fetchStockBatches(params) {
  return request({ path: `/psi/stock/batches${buildQs(params)}`, method: 'GET', timeout: 60000 })
    .catch(() => []);
}

function fetchNodesAll() {
  return request({ path: '/settings/nodes?all=true', method: 'GET' }).catch(() => []);
}

function fetchWorkersAll() {
  return request({ path: '/master/workers?all=true', method: 'GET' })
    .then((body) => {
      if (Array.isArray(body)) return body;
      const parsed = parsePaginatedBody(body);
      return parsed.data;
    })
    .catch(() => []);
}

function fetchReportableMembers(tenantId) {
  if (!tenantId) return Promise.resolve([]);
  return request({
    path: `/tenants/${encodeURIComponent(tenantId)}/reportable-members`,
    method: 'GET',
  }).catch(() => []);
}

/** 报工页用：优先 master 工人，空则回退租户可报工成员 */
function fetchWorkersForReport(tenantId) {
  return fetchWorkersAll().then((workers) => {
    if (Array.isArray(workers) && workers.length > 0) {
      return workers;
    }
    return fetchReportableMembers(tenantId);
  });
}

function fetchBomsAll() {
  return request({ path: '/products/boms/all?all=true', method: 'GET', timeout: 60000 })
    .then((body) => normalizeListBody(body))
    .catch(() => []);
}

function getPlan(id) {
  if (!id) return Promise.resolve(null);
  return request({ path: `/plans/${encodeURIComponent(id)}`, method: 'GET' }).catch(() => null);
}

function updateOrderReport(orderId, milestoneId, reportId, body) {
  return request({
    path: `/orders/${encodeURIComponent(orderId)}/milestones/${encodeURIComponent(milestoneId)}/reports/${encodeURIComponent(reportId)}`,
    method: 'PUT',
    data: body,
  });
}

function deleteOrderReport(orderId, milestoneId, reportId) {
  return request({
    path: `/orders/${encodeURIComponent(orderId)}/milestones/${encodeURIComponent(milestoneId)}/reports/${encodeURIComponent(reportId)}`,
    method: 'DELETE',
  });
}

function updateProductReport(reportId, body) {
  return request({
    path: `/orders/product-progress/report/${encodeURIComponent(reportId)}`,
    method: 'PUT',
    data: body,
  });
}

function deleteProductReport(reportId) {
  return request({
    path: `/orders/product-progress/report/${encodeURIComponent(reportId)}`,
    method: 'DELETE',
  });
}

module.exports = {
  buildQs,
  parsePaginatedBody,
  listOrdersPaginated,
  getOrder,
  updateOrder,
  updateOrderDispatchStatus,
  getOrderReportable,
  createOrderReport,
  listReportHistory,
  listProductProgressAll,
  createProductReport,
  fetchProductionRecords,
  createProductionRecord,
  createProductionRecordBatch,
  updateProductionRecord,
  deleteProductionRecord,
  fetchWarehousesAll,
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchStockBatches,
  fetchNodesAll,
  fetchWorkersAll,
  fetchWorkersForReport,
  fetchReportableMembers,
  fetchBomsAll,
  getPlan,
  updateOrderReport,
  deleteOrderReport,
  updateProductReport,
  deleteProductReport,
};
