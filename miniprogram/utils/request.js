const { API_BASE } = require('../config.js');

let refreshPromise = null;

function refreshToken() {
  if (refreshPromise) return refreshPromise;
  const refresh = wx.getStorageSync('refreshToken');
  if (!refresh) return Promise.resolve(false);

  refreshPromise = new Promise((resolve) => {
    wx.request({
      url: `${API_BASE}/auth/refresh`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { refreshToken: refresh },
      complete: () => {
        refreshPromise = null;
      },
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.accessToken) {
          wx.setStorageSync('accessToken', res.data.accessToken);
          if (res.data.refreshToken) {
            wx.setStorageSync('refreshToken', res.data.refreshToken);
          }
          resolve(true);
        } else {
          resolve(false);
        }
      },
      fail: () => resolve(false),
    });
  });
  return refreshPromise;
}

/**
 * 已登录请求：自动带 Bearer，401 时尝试 refresh 后重试一次
 * @param {{ path: string, method?: string, data?: object }} opts path 以 / 开头，如 /auth/me
 */
function request(opts) {
  const { path, method = 'GET', data } = opts;
  const url = `${API_BASE}${path}`;
  const m = (method || 'GET').toUpperCase();
  const payload = m === 'GET' || m === 'HEAD' ? undefined : data || {};

  const once = () =>
    new Promise((resolve, reject) => {
      const access = wx.getStorageSync('accessToken');
      wx.request({
        url,
        method: m,
        ...(payload !== undefined ? { data: payload } : {}),
        header: {
          'Content-Type': 'application/json',
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        success(res) {
          if (res.statusCode === 401) {
            reject(Object.assign(new Error('UNAUTHORIZED'), { statusCode: 401 }));
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
            return;
          }
          const msg =
            (res.data && (res.data.error || res.data.message)) || `请求失败 ${res.statusCode}`;
          reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)));
        },
        fail(err) {
          reject(err);
        },
      });
    });

  return once().catch(async (err) => {
    if (err && err.statusCode === 401) {
      const ok = await refreshToken();
      if (ok) return once();
    }
    throw err;
  });
}

module.exports = {
  API_BASE,
  request,
  refreshToken,
};
