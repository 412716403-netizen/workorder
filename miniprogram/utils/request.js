const { API_BASE } = require('../config.js');
const { clearSession } = require('./session.js');

let refreshPromise = null;
let authRedirecting = false;

function handleAuthFailure() {
  if (authRedirecting) return;
  authRedirecting = true;
  clearSession();
  wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
  wx.reLaunch({
    url: '/pages/login/login',
    complete: () => {
      authRedirecting = false;
    },
  });
}

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
  const { path, method = 'GET', data, timeout = 45000 } = opts;
  const url = `${API_BASE}${path}`;
  const m = (method || 'GET').toUpperCase();
  const payload = m === 'GET' || m === 'HEAD' ? undefined : data || {};

  const once = () =>
    new Promise((resolve, reject) => {
      const access = wx.getStorageSync('accessToken');
      const header = { 'Content-Type': 'application/json' };
      if (access) header.Authorization = `Bearer ${access}`;
      const reqOpts = {
        url,
        method: m,
        timeout,
        header,
        success(res) {
          if (res.statusCode === 401) {
            reject(Object.assign(new Error('UNAUTHORIZED'), { statusCode: 401 }));
            return;
          }
          if (res.statusCode === 403) {
            reject(Object.assign(new Error('FORBIDDEN'), { statusCode: 403 }));
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
          const errMsg = (err && err.errMsg) || '';
          // eslint-disable-next-line no-console
          console.error('[request fail]', url, errMsg || err);
          if (/timeout/i.test(errMsg)) {
            reject(new Error('网络请求超时，请稍后重试'));
            return;
          }
          reject(err);
        },
      };
      if (payload !== undefined) reqOpts.data = payload;
      wx.request(reqOpts);
    });

  return once().catch((err) => {
    if (err && err.statusCode === 401) {
      return refreshToken().then((ok) => {
        if (ok) return once();
        handleAuthFailure();
        throw err;
      });
    }
    throw err;
  });
}

module.exports = {
  API_BASE,
  request,
  refreshToken,
};
