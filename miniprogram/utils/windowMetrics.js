/** 读取窗口与安全区指标（优先新 API，兼容旧基础库） */
function readWindowMetrics() {
  if (typeof wx.getWindowInfo === 'function') {
    const win = wx.getWindowInfo();
    return {
      windowWidth: win.windowWidth || 375,
      windowHeight: win.windowHeight || 667,
      statusBarHeight: win.statusBarHeight || 20,
      safeAreaBottom: win.safeArea && win.screenHeight
        ? win.screenHeight - win.safeArea.bottom
        : 0,
    };
  }
  const sys = wx.getSystemInfoSync();
  return {
    windowWidth: sys.windowWidth || 375,
    windowHeight: sys.windowHeight || 667,
    statusBarHeight: sys.statusBarHeight || 20,
    safeAreaBottom: sys.safeArea ? sys.screenHeight - sys.safeArea.bottom : 0,
  };
}

function readNavBarMetrics() {
  try {
    const { statusBarHeight } = readWindowMetrics();
    const menu = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height;
    return { statusBarHeight, navBarHeight };
  } catch (err) {
    return { statusBarHeight: 20, navBarHeight: 44 };
  }
}

module.exports = {
  readWindowMetrics,
  readNavBarMetrics,
};
