/** 工作台消息已读（wx.storage，按租户 + 用户隔离，对齐 Web dashboardNotificationRead） */

const STORAGE_KEY = 'smarttrack.dashboardNotificationRead.v1';

function compositeKey(tenantId, userId) {
  const uid = (userId && String(userId).trim()) || 'unknown';
  return `${tenantId}|${uid}`;
}

function loadStore() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  try {
    wx.setStorageSync(STORAGE_KEY, store);
  } catch {
    /* ignore quota */
  }
}

function getReadIdSet(tenantId, userId) {
  if (!tenantId) return new Set();
  const ids = loadStore()[compositeKey(tenantId, userId)] || [];
  return new Set(Array.isArray(ids) ? ids : []);
}

function isRead(tenantId, userId, messageId) {
  if (!messageId) return true;
  return getReadIdSet(tenantId, userId).has(messageId);
}

function markRead(tenantId, userId, messageId) {
  if (!tenantId || !messageId) return;
  const key = compositeKey(tenantId, userId);
  const store = loadStore();
  const prev = new Set(store[key] || []);
  prev.add(messageId);
  store[key] = [...prev];
  saveStore(store);
}

function markAllRead(tenantId, userId, messageIds) {
  if (!tenantId || !Array.isArray(messageIds)) return;
  const key = compositeKey(tenantId, userId);
  const store = loadStore();
  const prev = new Set(store[key] || []);
  messageIds.forEach((id) => {
    if (id) prev.add(id);
  });
  store[key] = [...prev];
  saveStore(store);
}

function countUnread(tenantId, userId, notifications) {
  const list = Array.isArray(notifications) ? notifications : [];
  const read = getReadIdSet(tenantId, userId);
  return list.filter((n) => n && n.id && !read.has(n.id)).length;
}

module.exports = {
  isRead,
  markRead,
  markAllRead,
  countUnread,
};
