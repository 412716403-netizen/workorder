const HOME_TAB_PATH = '/pages/home/home';
const EXPLICIT_HOME_TAB_KEY = '_explicitHomeTabNav';

function markExplicitHomeTabNav() {
  try {
    wx.setStorageSync(EXPLICIT_HOME_TAB_KEY, Date.now());
  } catch (_err) {
    /* ignore */
  }
}

function consumeExplicitHomeTabNav() {
  try {
    const ts = Number(wx.getStorageSync(EXPLICIT_HOME_TAB_KEY) || 0);
    wx.removeStorageSync(EXPLICIT_HOME_TAB_KEY);
    return ts > 0 && Date.now() - ts < 5000;
  } catch (_err) {
    return false;
  }
}

module.exports = {
  HOME_TAB_PATH,
  EXPLICIT_HOME_TAB_KEY,
  markExplicitHomeTabNav,
  consumeExplicitHomeTabNav,
};
