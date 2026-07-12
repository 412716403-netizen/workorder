const TAB_PAGE_PREFIXES = [
  '/pages/home/',
  '/pages/apps/',
  '/pages/scan/',
  '/pages/messages/',
  '/pages/mine/',
];

function isTabBarPath(path) {
  const url = String(path || '');
  return TAB_PAGE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * 应用中心 / 首页快捷入口统一跳转（支持主包 /pages 与分包 /packageBusiness）。
 */
function navigateMenuPath(path, options = {}) {
  const url = String(path || '').trim();
  if (!url) {
    wx.showToast({ title: options.emptyTitle || '功能开发中', icon: 'none' });
    return false;
  }
  if (!url.startsWith('/')) {
    wx.showToast({ title: '页面路径无效', icon: 'none' });
    return false;
  }

  const fail = () => {
    wx.showToast({ title: options.failTitle || '页面打开失败', icon: 'none' });
  };

  if (isTabBarPath(url)) {
    wx.switchTab({
      url,
      fail: () => {
        wx.reLaunch({
          url,
          fail,
        });
      },
    });
  } else {
    wx.navigateTo({
      url,
      fail: (err) => {
        if (options.log !== false) console.error('[navigateMenuPath]', url, err);
        fail();
      },
    });
  }
  return true;
}

module.exports = {
  isTabBarPath,
  navigateMenuPath,
};
