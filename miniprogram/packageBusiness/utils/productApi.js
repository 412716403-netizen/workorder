const { request } = require('../../utils/request.js');
const { normalizeListBody } = require('../../utils/listResponse.js');

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
};
