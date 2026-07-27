const { request } = require('./request.js');
const { normalizeListBody } = require('./listResponse.js');
const { invalidateMasterDataCache } = require('./masterDataCache.js');

/** 写操作后清掉消费方缓存，避免列表里的合作单位标签停留在旧值 */
function dropPartnersCache(res) {
  invalidateMasterDataCache('partners');
  return res;
}

/** 实时读取（不走缓存）。只读消费方请用 planApi.fetchPartnersAll，那边带 90s 缓存。 */
function fetchPartnersAll() {
  return request({ path: '/master/partners?all=true', method: 'GET', timeout: 60000 })
    .then((body) => normalizeListBody(body));
}

function fetchPartnerCategoriesAll() {
  return request({ path: '/settings/partner-categories?all=true', method: 'GET', timeout: 60000 })
    .then((body) => normalizeListBody(body))
    .catch(() => []);
}

function createPartner(body) {
  return request({ path: '/master/partners', method: 'POST', data: body, timeout: 60000 })
    .then(dropPartnersCache);
}

function updatePartner(id, body) {
  return request({
    path: `/master/partners/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: body,
    timeout: 60000,
  }).then(dropPartnersCache);
}

function deletePartner(id) {
  return request({
    path: `/master/partners/${encodeURIComponent(id)}`,
    method: 'DELETE',
    timeout: 60000,
  }).then(dropPartnersCache);
}

module.exports = {
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
  createPartner,
  updatePartner,
  deletePartner,
};
