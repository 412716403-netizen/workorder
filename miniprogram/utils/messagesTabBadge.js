/** 自定义消息 Tab 角标；首页隐藏后不依赖固定下标。 */

function currentCustomTabBar() {
  if (typeof getCurrentPages !== 'function') return null;
  const pages = getCurrentPages();
  const current = pages && pages[pages.length - 1];
  return current && typeof current.getTabBar === 'function' ? current.getTabBar() : null;
}

function updateMessagesTabBadge(total) {
  const n = Number(total) || 0;
  const text = n > 99 ? '99+' : n > 0 ? String(n) : '';
  wx.setStorageSync('messagesTabBadge', text);
  const tabBar = currentCustomTabBar();
  if (tabBar && typeof tabBar.setMessageBadge === 'function') {
    tabBar.setMessageBadge(n);
  }
}

module.exports = {
  updateMessagesTabBadge,
};
