/** 扫码页摄像头与降级相关工具 */

const SCAN_DEBOUNCE_CONTINUOUS_MS = 800;
const SCAN_DEBOUNCE_SINGLE_MS = 1500;

function isDevtools() {
  try {
    const info = wx.getSystemInfoSync();
    return info.platform === 'devtools';
  } catch {
    return false;
  }
}

/**
 * 检查并请求摄像头权限
 * @returns {Promise<'granted'|'denied'|'devtools'>}
 */
function ensureCameraAuth() {
  if (isDevtools()) {
    return Promise.resolve('devtools');
  }
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => {
        const status = res.authSetting['scope.camera'];
        if (status === true) {
          resolve('granted');
          return;
        }
        if (status === false) {
          resolve('denied');
          return;
        }
        wx.authorize({
          scope: 'scope.camera',
          success: () => resolve('granted'),
          fail: () => resolve('denied'),
        });
      },
      fail: () => resolve('denied'),
    });
  });
}

function openAppSetting() {
  wx.openSetting({
    success: (res) => {
      if (res.authSetting['scope.camera']) {
        return 'granted';
      }
      return 'denied';
    },
  });
}

function vibrateOnScan() {
  if (wx.vibrateShort) {
    wx.vibrateShort({ type: 'medium' });
  }
}

module.exports = {
  SCAN_DEBOUNCE_CONTINUOUS_MS,
  SCAN_DEBOUNCE_SINGLE_MS,
  isDevtools,
  ensureCameraAuth,
  openAppSetting,
  vibrateOnScan,
};
