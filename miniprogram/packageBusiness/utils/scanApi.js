const { request } = require('../../utils/request.js');

/**
 * @param {{ kind: string, token: string }} payload
 */
function fetchScanByPayload(payload) {
  const token = encodeURIComponent(payload.token);
  if (payload.kind === 'BATCH') {
    return request({ path: `/plan-virtual-batches/scan/${token}`, method: 'GET' });
  }
  return request({ path: `/item-codes/scan/${token}`, method: 'GET' });
}

function fetchItemTrace(token, page = 1, pageSize = 20) {
  const enc = encodeURIComponent(token);
  return request({
    path: `/item-codes/trace/${enc}?page=${page}&pageSize=${pageSize}`,
    method: 'GET',
  });
}

/**
 * @param {object} body
 */
function validateScanUsage(body) {
  return request({
    path: '/item-codes/scan/validate-usage',
    method: 'POST',
    data: body,
  });
}

function createMilestoneReport(orderId, milestoneId, body) {
  return request({
    path: `/orders/${orderId}/milestones/${milestoneId}/reports`,
    method: 'POST',
    data: body,
  });
}

function fetchOrder(orderId) {
  return request({ path: `/orders/${orderId}`, method: 'GET' });
}

/**
 * @param {Record<string, string | undefined>} params
 */
function fetchProductionRecords(params) {
  const qs = Object.entries(params || {})
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return request({ path: `/production/records${qs ? `?${qs}` : ''}`, method: 'GET' });
}

function createProductionRecord(body) {
  return request({ path: '/production/records', method: 'POST', data: body });
}

module.exports = {
  fetchScanByPayload,
  fetchItemTrace,
  validateScanUsage,
  createMilestoneReport,
  fetchOrder,
  fetchProductionRecords,
  createProductionRecord,
};
