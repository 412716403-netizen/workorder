const { request } = require('../../utils/request.js');
const { normalizeListBody } = require('../../utils/listResponse.js');
const { fetchSettingsConfig } = require('../../utils/settingsApi.js');
const { PRODUCT_CODE_RULES_CONFIG_KEY } = require('./productCodeRule.js');

function buildQs(params) {
  const parts = [];
  Object.keys(params || {}).forEach((key) => {
    const v = params[key];
    if (v === undefined || v === null || v === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

function fetchProductsAll() {
  return request({ path: '/products?all=true&lite=true', method: 'GET', timeout: 60000 })
    .then((body) => normalizeListBody(body))
    .catch(() => []);
}

function fetchBomsAll() {
  return request({ path: '/products/boms/all?all=true', method: 'GET', timeout: 60000 })
    .then((body) => normalizeListBody(body))
    .catch(() => []);
}

function getProduct(id) {
  if (!id) return Promise.resolve(null);
  return request({ path: `/products/${encodeURIComponent(id)}`, method: 'GET', timeout: 60000 });
}

function createProduct(body) {
  return request({ path: '/products', method: 'POST', data: body, timeout: 60000 });
}

function updateProduct(id, body) {
  return request({
    path: `/products/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: body,
    timeout: 60000,
  });
}

function deleteProduct(id) {
  return request({
    path: `/products/${encodeURIComponent(id)}`,
    method: 'DELETE',
    timeout: 60000,
  });
}

function fetchVariantUsage(productId, variantIds) {
  const ids = (variantIds || []).filter(Boolean);
  if (!productId || ids.length === 0) return Promise.resolve({ usages: [] });
  const qs = buildQs({ variantIds: ids.join(',') });
  return request({
    path: `/products/${encodeURIComponent(productId)}/variant-usage${qs}`,
    method: 'GET',
  }).catch(() => ({ usages: [] }));
}

function getBom(id) {
  if (!id) return Promise.resolve(null);
  return request({ path: `/products/boms/${encodeURIComponent(id)}`, method: 'GET' });
}

function createBom(body) {
  return request({ path: '/products/boms', method: 'POST', data: body, timeout: 60000 });
}

function updateBom(id, body) {
  return request({
    path: `/products/boms/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: body,
    timeout: 60000,
  });
}

function deleteBom(id) {
  return request({
    path: `/products/boms/${encodeURIComponent(id)}`,
    method: 'DELETE',
    timeout: 60000,
  });
}

function fetchReceiveUnitWeightAverages(productId) {
  return request({
    path: `/products/${encodeURIComponent(productId)}/receive-unit-weight-averages`,
    method: 'GET',
  }).catch(() => ({ averages: {} }));
}

/** 预取下一产品编号（对齐 Web api.products.nextCode） */
function nextCode(params) {
  const qs = buildQs({
    prefix: params && params.prefix != null ? params.prefix : '',
    serialLength: params && params.serialLength != null ? String(params.serialLength) : '',
  });
  return request({
    path: `/products/next-code${qs}`,
    method: 'GET',
  });
}

/**
 * 读取网页配置的产品编号规则（与 settings productCodeRules 同源）。
 * 优先专用只读端点（租户任意成员可读）；该端点未部署时回退整包 GET /settings/config
 * （后者需 psi/finance 或 settings:config:view，细粒度产品/开发角色会拿不到，退化为手动输入）。
 */
function fetchProductCodeRules() {
  return request({ path: '/products/code-rules', method: 'GET' })
    .then((body) => (body && body.rules != null ? body.rules : {}))
    .catch(() =>
      fetchSettingsConfig()
        .then((cfg) => {
          const rules = cfg ? cfg[PRODUCT_CODE_RULES_CONFIG_KEY] : null;
          return rules != null ? rules : {};
        })
        .catch(() => ({})),
    );
}

module.exports = {
  buildQs,
  fetchProductsAll,
  fetchBomsAll,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  fetchVariantUsage,
  getBom,
  createBom,
  updateBom,
  deleteBom,
  fetchReceiveUnitWeightAverages,
  nextCode,
  fetchProductCodeRules,
};
