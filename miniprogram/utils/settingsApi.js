const { request } = require('./request.js');
const { normalizeListBody } = require('./listResponse.js');

function normalizeUsageBody(body) {
  if (body && Array.isArray(body.usedIds)) return new Set(body.usedIds);
  return new Set();
}

async function fetchListAll(path) {
  const body = await request({ path: `${path}?all=true`, method: 'GET' });
  return normalizeListBody(body);
}

async function fetchUsage(path) {
  const body = await request({ path: `${path}/usage`, method: 'GET' });
  return normalizeUsageBody(body);
}

function crud(path) {
  return {
    fetchAll: () => fetchListAll(path),
    fetchUsage: () => fetchUsage(path),
    create: (data) => request({ path, method: 'POST', data, timeout: 60000 }),
    update: (id, data) =>
      request({
        path: `${path}/${encodeURIComponent(id)}`,
        method: 'PUT',
        data,
        timeout: 60000,
      }),
    delete: (id) =>
      request({
        path: `${path}/${encodeURIComponent(id)}`,
        method: 'DELETE',
        timeout: 60000,
      }),
  };
}

const categories = crud('/settings/categories');
const partnerCategories = crud('/settings/partner-categories');
const nodes = {
  ...crud('/settings/nodes'),
  reorder(orderedIds) {
    return request({
      path: '/settings/nodes/reorder',
      method: 'PUT',
      data: { orderedIds },
      timeout: 60000,
    });
  },
};
const warehouses = crud('/settings/warehouses');
const financeCategories = crud('/settings/finance-categories');
/** 收支账户类型（资金账户档案）：权限 settings:finance_account_types:* */
const financeAccountTypes = crud('/settings/finance-account-types');

function fetchSettingsConfig() {
  return request({ path: '/settings/config', method: 'GET' });
}

function updateSettingsConfig(key, value) {
  return request({
    path: `/settings/config/${encodeURIComponent(key)}`,
    method: 'PUT',
    data: { value },
    timeout: 60000,
  });
}

module.exports = {
  categories,
  partnerCategories,
  nodes,
  warehouses,
  financeCategories,
  financeAccountTypes,
  fetchSettingsConfig,
  updateSettingsConfig,
  fetchCategoriesAll: categories.fetchAll,
  fetchPartnerCategoriesAll: partnerCategories.fetchAll,
  fetchNodesAll: nodes.fetchAll,
  fetchWarehousesAll: warehouses.fetchAll,
  fetchFinanceCategoriesAll: financeCategories.fetchAll,
};
