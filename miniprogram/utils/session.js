/** 清除登录态（与网页端 localStorage 项对应） */
const { clearUnsavedFormDrafts } = require('./unsavedFormDrafts.js');

function clearSession() {
  clearUnsavedFormDrafts();
  try {
    require('./featurePlugins.js').clearFeaturePluginsCache();
  } catch (_err) {
    /* ignore */
  }
  try {
    require('./masterDataCache.js').invalidateMasterDataCache();
  } catch (_err) {
    /* ignore */
  }
  wx.removeStorageSync('accessToken');
  wx.removeStorageSync('refreshToken');
  wx.removeStorageSync('tenantCtx');
  wx.removeStorageSync('userTenants');
  wx.removeStorageSync('currentUser');
  wx.removeStorageSync('messagesTabBadge');
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

/** 兼容 GET /tenants?all=true 数组与默认分页体 { data, total } */
function parseTenantListResponse(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
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
  parseTenantListResponse,
  readTenantCtx,
  readCurrentUser,
  readCurrentUserId,
  readOperatorDisplayName,
};
