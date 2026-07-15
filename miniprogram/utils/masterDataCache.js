/**
 * 主数据短 TTL 内存缓存：开发者工具 / 真机反复进页时避免 products?all=true 等全量请求刷屏。
 * 主包与业务分包均可 require。
 */

const DEFAULT_TTL_MS = 60 * 1000;

/** @type {Map<string, { expiresAt: number, value: unknown, inflight: Promise<unknown> | null }>} */
const store = new Map();

function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

/**
 * 同 key 并发请求合并为一次网络调用。
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {number} [ttlMs]
 * @returns {Promise<T>}
 */
function cachedFetch(key, fetcher, ttlMs) {
  const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  const fresh = cacheGet(key);
  if (fresh !== null && fresh !== undefined) {
    return Promise.resolve(/** @type {T} */ (fresh));
  }
  const existing = store.get(key);
  if (existing && existing.inflight) {
    return /** @type {Promise<T>} */ (existing.inflight);
  }
  const inflight = Promise.resolve()
    .then(() => fetcher())
    .then((value) => {
      store.set(key, {
        expiresAt: Date.now() + ttl,
        value,
        inflight: null,
      });
      return value;
    })
    .catch((err) => {
      store.delete(key);
      throw err;
    });
  store.set(key, { expiresAt: 0, value: null, inflight });
  return inflight;
}

function invalidateMasterDataCache(prefix) {
  if (!prefix) {
    store.clear();
    return;
  }
  [...store.keys()].forEach((k) => {
    if (k === prefix || k.startsWith(`${prefix}:`)) store.delete(k);
  });
}

module.exports = {
  cachedFetch,
  cacheGet,
  invalidateMasterDataCache,
  DEFAULT_TTL_MS,
};
