const { hasPermission, hasWorkbenchNavAccess } = require('./permissions.js');

const TAB_ITEMS = [
  {
    key: 'home',
    text: '首页',
    path: '/pages/home/home',
    iconPath: '/assets/tab/home.png',
    selectedIconPath: '/assets/tab/home-active.png',
    requiresWorkbench: true,
  },
  {
    key: 'apps',
    text: '应用',
    path: '/pages/apps/apps',
    iconPath: '/assets/tab/apps.png',
    selectedIconPath: '/assets/tab/apps-active.png',
  },
  {
    key: 'scan',
    text: '报工',
    path: '/pages/scan/scan',
    iconPath: '/assets/tab/scan.png',
    selectedIconPath: '/assets/tab/scan-active.png',
  },
  {
    key: 'messages',
    text: '消息',
    path: '/pages/messages/messages',
    iconPath: '/assets/tab/messages.png',
    selectedIconPath: '/assets/tab/messages-active.png',
  },
  {
    key: 'mine',
    text: '我的',
    path: '/pages/mine/mine',
    iconPath: '/assets/tab/mine.png',
    selectedIconPath: '/assets/tab/mine-active.png',
  },
];

function canShowHomeTab(ctx) {
  if (!ctx) return false;
  return hasWorkbenchNavAccess(ctx.permissions, ctx.tenantRole);
}

function buildVisibleTabItems(ctx) {
  const showHome = canShowHomeTab(ctx);
  return TAB_ITEMS.filter((item) => !item.requiresWorkbench || showHome);
}

function resolveDefaultTabPath(ctx) {
  if (canShowHomeTab(ctx)) return '/pages/home/home';
  if (ctx && hasPermission(ctx.permissions, 'process_report')) return '/pages/scan/scan';
  const visible = buildVisibleTabItems(ctx);
  return visible.length ? visible[0].path : '/pages/mine/mine';
}

function syncCurrentCustomTabBar(ctx) {
  if (typeof getCurrentPages !== 'function') return;
  const pages = getCurrentPages();
  const current = pages && pages[pages.length - 1];
  const tabBar = current && typeof current.getTabBar === 'function' ? current.getTabBar() : null;
  if (tabBar && typeof tabBar.syncAccess === 'function') {
    tabBar.syncAccess(ctx);
  }
}

module.exports = {
  TAB_ITEMS,
  canShowHomeTab,
  buildVisibleTabItems,
  resolveDefaultTabPath,
  syncCurrentCustomTabBar,
};
