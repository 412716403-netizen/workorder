const { request } = require('../../utils/request.js');

function createDictionaryItem(body) {
  return request({ path: '/master/dictionaries', method: 'POST', data: body, timeout: 60000 });
}

function updateDictionaryItem(id, body) {
  return request({
    path: `/master/dictionaries/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: body,
    timeout: 60000,
  });
}

function deleteDictionaryItem(id) {
  return request({
    path: `/master/dictionaries/${encodeURIComponent(id)}`,
    method: 'DELETE',
    timeout: 60000,
  });
}

module.exports = {
  createDictionaryItem,
  updateDictionaryItem,
  deleteDictionaryItem,
};
