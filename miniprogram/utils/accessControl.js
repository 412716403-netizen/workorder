/**
 * 小程序菜单/快捷入口访问控制 — 与 Web filterWorkbenchShortcutsByAccess + 协作侧栏规则对齐
 */

const COLLABORATION_LIST_PERM = 'collaboration:list:allow';

function isTenantElevatedRole(tenantRole) {
  return tenantRole === 'owner' || tenantRole === 'admin';
}

/** 与 Web utils/hasSubPermission.ts 一致 */
function hasSubPermission(userPermissions, required) {
  if (!required) return true;
  if (!userPermissions || userPermissions.length === 0) return false;
  if (userPermissions.includes(required)) return true;
  const module = String(required).split(':')[0];
  if (module && userPermissions.includes(module)) return true;
  return false;
}

/** 与 Web utils/hasModulePerm.ts 一致 */
function hasModulePerm(tenantRole, userPermissions, moduleName, permKey) {
  if (isTenantElevatedRole(tenantRole)) return true;
  if (!userPermissions || userPermissions.length === 0) return true;
  if (
    userPermissions.includes(moduleName) &&
    !userPermissions.some((p) => String(p).startsWith(`${moduleName}:`))
  ) {
    return true;
  }
  if (userPermissions.includes(permKey)) return true;
  if (userPermissions.some((p) => String(p).startsWith(`${permKey}:`))) return true;
  return false;
}

/** 与 Web utils/canViewAmount.ts hasCollaborationModuleAccess */
function hasCollaborationModuleAccess(tenantRole, userPermissions) {
  if (isTenantElevatedRole(tenantRole)) return true;
  if (!userPermissions || userPermissions.length === 0) return true;
  return userPermissions.includes('collaboration');
}

/** 与 Web utils/canViewAmount.ts canViewCollaborationList */
function canViewCollaborationList(tenantRole, userPermissions) {
  if (!hasCollaborationModuleAccess(tenantRole, userPermissions)) return false;
  return hasModulePerm(tenantRole, userPermissions, 'collaboration', COLLABORATION_LIST_PERM);
}

function isCollaborationShortcut(item) {
  if (!item) return false;
  if (item.id === 'collaboration-inbox' || item.key === 'collaboration-inbox') return true;
  return item.module === 'collaboration' || item.pluginId === 'collaboration';
}

function readItemPerm(item) {
  if (!item) return '';
  if (item.perm) return item.perm;
  if (item.permission) return item.permission;
  return '';
}

function readItemModule(item) {
  return item && item.module ? item.module : '';
}

/**
 * 快捷入口 / 应用中心项过滤（RBAC + 插件 + 协作特例）
 * @param {Array} items catalog 或 menu 项（支持 perm/permission、module、pluginId、id/key）
 */
function filterShortcutsByAccess(items, plugins, tenantRole, permissions) {
  if (!Array.isArray(items)) return [];
  const perms = Array.isArray(permissions) ? permissions : [];
  const pluginMap = plugins && typeof plugins === 'object' ? plugins : {};

  return items.filter((item) => {
    if (item.pluginId && pluginMap[item.pluginId] === false) return false;

    if (isCollaborationShortcut(item)) {
      return canViewCollaborationList(tenantRole, perms);
    }

    if (isTenantElevatedRole(tenantRole)) return true;

    if (!perms.length) return true;

    const itemPerm = readItemPerm(item);
    if (itemPerm && !hasSubPermission(perms, itemPerm)) return false;

    const itemModule = readItemModule(item);
    if (itemModule && !hasModulePerm(tenantRole, perms, itemModule, itemModule)) return false;

    return true;
  });
}

/**
 * 系统设置 Tab 可见性 — 对齐 Web SettingsView canView / hasPerm
 */
function canViewSettingsTab(permissions, tenantRole, tabPermission) {
  if (tenantRole === 'owner') return true;
  if (!tabPermission) return true;
  if (!permissions || permissions.length === 0) return true;
  if (permissions.includes(tabPermission)) return true;
  const module = String(tabPermission).split(':')[0];
  if (module && permissions.includes(module)) return true;
  return false;
}

module.exports = {
  isTenantElevatedRole,
  hasSubPermission,
  hasModulePerm,
  hasCollaborationModuleAccess,
  canViewCollaborationList,
  filterShortcutsByAccess,
  canViewSettingsTab,
};
