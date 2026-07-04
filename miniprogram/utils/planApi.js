const { request } = require('./request.js');
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

function listPlansPaginated(params) {
  return request({ path: `/plans${buildQs(params)}`, method: 'GET' }).then(parsePaginatedBody);
}

function getPlan(id) {
  return request({ path: `/plans/${encodeURIComponent(id)}`, method: 'GET', timeout: 60000 });
}

function createPlan(body) {
  return request({ path: '/plans', method: 'POST', data: body });
}

function convertPlan(id) {
  return request({ path: `/plans/${encodeURIComponent(id)}/convert`, method: 'POST' });
}

function fetchPlansPurchaseProgress(plans) {
  if (!plans || plans.length === 0) return Promise.resolve([]);
  return request({
    path: '/psi/plans-purchase-progress',
    method: 'POST',
    data: { plans },
  }).catch(() => []);
}

function fetchPlanRelated(planId, planNumbers) {
  const nums = (planNumbers || []).filter(Boolean);
  const qs = buildQs({
    planId: planId || '',
    planNumbers: nums.length ? nums.join(',') : undefined,
  });
  return request({ path: `/psi/plan-related${qs}`, method: 'GET' }).catch(() => ({
    purchaseOrders: [],
    purchaseBills: [],
  }));
}

function fetchTenantConfig() {
  // 无 settings:config:view 时后端返回 403，生产计划页用默认配置即可
  return request({ path: '/settings/config', method: 'GET', timeout: 30000 }).catch((err) => {
    if (err && err.statusCode === 401) throw err;
    return {};
  });
}

function fetchDictionaries() {
  return request({ path: '/master/dictionaries', method: 'GET' }).catch(() => ({
    colors: [],
    sizes: [],
    units: [],
  }));
}

function getProduct(id) {
  if (!id) return Promise.resolve(null);
  return request({ path: `/products/${encodeURIComponent(id)}`, method: 'GET' });
}

function fetchProductsAll() {
  return request({ path: '/products?all=true', method: 'GET', timeout: 60000 }).catch(() => []);
}

function fetchCategoriesAll() {
  return request({ path: '/settings/categories?all=true', method: 'GET' }).catch(() => []);
}

function fetchPartnersAll() {
  return request({ path: '/master/partners?all=true', method: 'GET' }).catch(() => []);
}

function fetchPartnerCategoriesAll() {
  return request({ path: '/settings/partner-categories?all=true', method: 'GET' }).catch(() => []);
}

function fetchNodesAll() {
  return request({ path: '/settings/nodes?all=true', method: 'GET' }).catch(() => []);
}

function fetchEquipmentAll() {
  return request({ path: '/master/equipment?all=true', method: 'GET' }).catch(() => []);
}

function fetchBomsAll() {
  return request({ path: '/products/boms/all?all=true', method: 'GET', timeout: 60000 })
    .then((body) => normalizeListBody(body))
    .catch(() => []);
}

function fetchStockMap() {
  return request({ path: '/psi/stock', method: 'GET', timeout: 60000 })
    .then((rows) => {
      const map = {};
      if (!Array.isArray(rows)) return map;
      rows.forEach((e) => {
        const pid = e && e.productId;
        if (!pid) return;
        map[pid] = Math.max(0, Number(e.stock) || 0);
      });
      return map;
    })
    .catch(() => ({}));
}

module.exports = {
  buildQs,
  parsePaginatedBody,
  listPlansPaginated,
  getPlan,
  getProduct,
  createPlan,
  convertPlan,
  fetchPlansPurchaseProgress,
  fetchPlanRelated,
  fetchTenantConfig,
  fetchDictionaries,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
  fetchNodesAll,
  fetchEquipmentAll,
  fetchBomsAll,
  fetchStockMap,
};
