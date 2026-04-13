/** 清除登录态（与网页端 localStorage 项对应） */
function clearSession() {
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
  } catch {
    return [];
  }
}

function readTenantCtx() {
  const raw = wx.getStorageSync('tenantCtx');
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  clearSession,
  readTenants,
  readTenantCtx,
};
