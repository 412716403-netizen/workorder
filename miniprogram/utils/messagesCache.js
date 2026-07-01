/**
 * 跨页面消息数据缓存（避免 URL 传大对象）
 */

let _cache = null;

function setCache(data) {
  _cache = data;
}

function getCache() {
  return _cache;
}

function clearCache() {
  _cache = null;
}

module.exports = {
  setCache,
  getCache,
  clearCache,
};
