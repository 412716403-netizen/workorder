const { hasPermission, hasWorkbenchNavAccess, isTenantElevatedRole } = require('./permissions.js');
const { getCachedFeaturePlugins } = require('./featurePlugins.js');

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
    requiresApps: true,
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

/** 权限是否仅含工序报工（含 process_report:* 子权限） */
function isProcessReportOnlyPermissions(permissions) {
  const perms = Array.isArray(permissions) ? permissions : [];
  if (perms.length === 0) return false;
  return perms.every(
    (p) => p === 'process_report' || String(p).startsWith('process_report:'),
  );
}

/**
 * 「应用」Tab 可见性：
 * - 创建者恒显示
 * - 仅工序报工权限时隐藏（报工已有独立 Tab，应用中心无业务入口）
 * - 应用中心按 RBAC/插件过滤后无任何入口时也隐藏
 */
function canShowAppsTab(ctx, plugins) {
  if (!ctx) return false;
  if (isTenantElevatedRole(ctx.tenantRole)) return true;
  if (isProcessReportOnlyPermissions(ctx.permissions)) return false;

  const { buildAppCategories } = require('../config/menus.js');
  const pluginMap =
    plugins && typeof plugins === 'object' ? plugins : getCachedFeaturePlugins() || {};
  const categories = buildAppCategories(
    ctx.permissions || [],
    '',
    pluginMap,
    ctx.tenantRole || '',
  );
  return categories.some((cat) => Array.isArray(cat.items) && cat.items.length > 0);
}

function buildVisibleTabItems(ctx, plugins) {
  const showHome = canShowHomeTab(ctx);
  const showApps = canShowAppsTab(ctx, plugins);
  return TAB_ITEMS.filter((item) => {
    if (item.requiresWorkbench && !showHome) return false;
    if (item.requiresApps && !showApps) return false;
    return true;
  });
}

function resolveDefaultTabPath(ctx, plugins) {
  if (canShowHomeTab(ctx)) return '/pages/home/home';
  if (ctx && hasPermission(ctx.permissions, 'process_report')) return '/pages/scan/scan';
  const visible = buildVisibleTabItems(ctx, plugins);
  return visible.length ? visible[0].path : '/pages/mine/mine';
}

function syncCurrentCustomTabBar(ctx) {
  if (typeof getCurrentPages !== 'function') return;

  const run = () => {
    const pages = getCurrentPages();
    const current = pages && pages[pages.length - 1];
    const tabBar = current && typeof current.getTabBar === 'function' ? current.getTabBar() : null;
    if (tabBar && typeof tabBar.syncAccess === 'function') {
      tabBar.syncAccess(ctx);
      return true;
    }
    return false;
  };

  if (!run() && typeof wx.nextTick === 'function') {
    wx.nextTick(run);
  }
}

module.exports = {
  TAB_ITEMS,
  canShowHomeTab,
  canShowAppsTab,
  isProcessReportOnlyPermissions,
  buildVisibleTabItems,
  resolveDefaultTabPath,
  syncCurrentCustomTabBar,
};
