/** 清除登录态（与网页端 localStorage 项对应） */
const { clearUnsavedFormDrafts } = require('./unsavedFormDrafts.js');

function clearSession() {
  clearUnsavedFormDrafts();
  wx.removeStorageSync('accessToken');
  wx.removeStorageSync('refreshToken');
  wx.removeStorageSync('tenantCtx');
  wx.removeStorageSync('userTenants');
  wx.removeStorageSync('currentUser');
}

function readTenants() {
  const raw = wx.getStorageSync('userTenants');
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch (_) {
    return [];
  }
}

function readTenantCtx() {
  const raw = wx.getStorageSync('tenantCtx');
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function readCurrentUser() {
  const raw = wx.getStorageSync('currentUser');
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function readCurrentUserId() {
  const user = readCurrentUser();
  if (!user) return '';
  return user.id || user.userId || '';
}

/** 生产流水经办人显示名（入库/报工/领料等写入 operator 字段） */
function readOperatorDisplayName() {
  const user = readCurrentUser();
  if (!user) return '';
  return String(user.displayName || user.username || '').trim();
}

module.exports = {
  clearSession,
  readTenants,
  readTenantCtx,
  readCurrentUser,
  readCurrentUserId,
  readOperatorDisplayName,
};
