/** 工作台消息已读：本地缓存 + 服务端同步（对齐 Web dashboardNotificationRead） */

const STORAGE_KEY = 'smarttrack.dashboardNotificationRead.v1';
const READS_PATH = '/dashboard/notification-reads';
/** 同一用户短时间内重复进出消息页只同步一次 */
const SYNC_TTL_MS = 30000;
/** 接口单次最多 100 个 id */
const PUSH_CHUNK_SIZE = 100;

const syncState = { key: '', at: 0, inflight: null };

function compositeKey(tenantId, userId) {
  const uid = (userId && String(userId).trim()) || 'unknown';
  return `${tenantId}|${uid}`;
}

function loadStore() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    return {};
  } catch (_) {
    return {};
  }
}

function saveStore(store) {
  try {
    wx.setStorageSync(STORAGE_KEY, store);
  } catch (_) {
    /* ignore quota */
  }
}

function writeLocalIds(tenantId, userId, ids) {
  if (!tenantId) return;
  const key = compositeKey(tenantId, userId);
  const store = loadStore();
  store[key] = Array.from(new Set((ids || []).map((id) => String(id)).filter(Boolean)));
  saveStore(store);
}

function getReadIdSet(tenantId, userId) {
  if (!tenantId) return new Set();
  const ids = loadStore()[compositeKey(tenantId, userId)] || [];
  return new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)));
}

function markRead(tenantId, userId, messageId) {
  if (!tenantId || !messageId) return;
  markAllRead(tenantId, userId, [messageId]);
}

/** 只上报本地尚未标记的 id，避免每次进消息中心都全量重报 */
function markAllRead(tenantId, userId, messageIds) {
  if (!tenantId || !Array.isArray(messageIds)) return;
  const prev = getReadIdSet(tenantId, userId);
  const added = [];
  messageIds.forEach((id) => {
    if (id == null || id === '') return;
    const key = String(id);
    if (prev.has(key)) return;
    prev.add(key);
    added.push(key);
  });
  if (!added.length) return;
  writeLocalIds(tenantId, userId, Array.from(prev));
  pushReadsToServer(added);
}

function pushReadsToServer(ids) {
  const list = (Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean);
  if (!list.length) return;
  try {
    const { request } = require('./request.js');
    for (let i = 0; i < list.length; i += PUSH_CHUNK_SIZE) {
      request({
        path: READS_PATH,
        method: 'POST',
        data: { ids: list.slice(i, i + PUSH_CHUNK_SIZE) },
      }).catch(() => {
        /* 下次 sync 再补报 */
      });
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * 从服务端拉取已读并与本地合并（网页已读 → 小程序清未读）。
 * TTL 内复用上次结果，并发调用复用同一请求；`force` 用于用户显式下拉刷新。
 * @returns {Promise<Set<string>>}
 */
function syncReadsFromServer(tenantId, userId, opts) {
  if (!tenantId) return Promise.resolve(new Set());
  const key = compositeKey(tenantId, userId);
  const force = Boolean(opts && opts.force);
  if (syncState.key === key) {
    if (syncState.inflight) return syncState.inflight;
    if (!force && Date.now() - syncState.at < SYNC_TTL_MS) {
      return Promise.resolve(getReadIdSet(tenantId, userId));
    }
  }

  const { request } = require('./request.js');
  const local = getReadIdSet(tenantId, userId);
  const inflight = request({ path: READS_PATH, method: 'GET' })
    .then((remote) => {
      const remoteIds = remote && Array.isArray(remote.ids) ? remote.ids.map(String) : [];
      const remoteSet = new Set(remoteIds);
      writeLocalIds(tenantId, userId, [...remoteIds, ...local]);
      const localOnly = Array.from(local).filter((id) => !remoteSet.has(id));
      if (localOnly.length) pushReadsToServer(localOnly);
      syncState.at = Date.now();
      return getReadIdSet(tenantId, userId);
    })
    .catch(() => local)
    .then((result) => {
      if (syncState.key === key) syncState.inflight = null;
      return result;
    });

  syncState.key = key;
  syncState.inflight = inflight;
  return inflight;
}

module.exports = {
  markRead,
  markAllRead,
  getReadIdSet,
  syncReadsFromServer,
};
