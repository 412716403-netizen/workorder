const { API_BASE } = require('../config.js');
const { clearSession } = require('./session.js');
const { isAccessTokenExpired } = require('./tokenUtils.js');

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

function ensureFreshAccessToken() {
  const access = wx.getStorageSync('accessToken');
  if (access && !isAccessTokenExpired(access)) {
    return Promise.resolve(true);
  }
  const refresh = wx.getStorageSync('refreshToken');
  if (!refresh) {
    return Promise.resolve(false);
  }
  return refreshToken();
}

function readErrorMessage(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  const msg = data.error || data.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}

/**
 * 已登录请求：过期前自动 refresh，401 时兜底重试一次
 * @param {{
 *   path: string,
 *   method?: string,
 *   data?: object,
 *   timeout?: number,
 *   responseType?: string,
 *   returnFullResponse?: boolean,
 * }} opts path 以 / 开头，如 /auth/me
 */
function request(opts) {
  const {
    path,
    method = 'GET',
    data,
    timeout = 45000,
    responseType,
    returnFullResponse = false,
  } = opts;
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
            const msg = readErrorMessage(res.data, '无权访问该功能');
            reject(Object.assign(new Error(msg), { statusCode: 403 }));
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (returnFullResponse) {
              resolve({
                data: res.data,
                header: res.header || {},
                statusCode: res.statusCode,
              });
              return;
            }
            resolve(res.data);
            return;
          }
          const msg = readErrorMessage(res.data, `请求失败 ${res.statusCode}`);
          reject(Object.assign(new Error(msg), {
            statusCode: res.statusCode,
          }));
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
      if (responseType) reqOpts.responseType = responseType;
      if (payload !== undefined) reqOpts.data = payload;
      wx.request(reqOpts);
    });

  return ensureFreshAccessToken()
    .then((ok) => {
      if (!ok) {
        handleAuthFailure();
        throw Object.assign(new Error('UNAUTHORIZED'), { statusCode: 401 });
      }
      return once();
    })
    .catch((err) => {
      if (err && err.statusCode === 401) {
        return refreshToken().then((refreshed) => {
          if (refreshed) return once();
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
  ensureFreshAccessToken,
};
