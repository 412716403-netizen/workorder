/**
 * 归一化后端列表响应：支持纯数组或 { data, total, page, pageSize }
 * @param {unknown} body
 * @returns {unknown[]}
 */
function normalizeListBody(body) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray(body.data)) {
    return body.data;
  }
  return [];
}

module.exports = {
  normalizeListBody,
};
