const { request } = require('./request.js');
const { normalizeListBody } = require('./listResponse.js');

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
  return request({ path: '/master/partners', method: 'POST', data: body, timeout: 60000 });
}

function updatePartner(id, body) {
  return request({
    path: `/master/partners/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: body,
    timeout: 60000,
  });
}

function deletePartner(id) {
  return request({
    path: `/master/partners/${encodeURIComponent(id)}`,
    method: 'DELETE',
    timeout: 60000,
  });
}

module.exports = {
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
  createPartner,
  updatePartner,
  deletePartner,
};
