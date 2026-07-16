/** 权限判断：与 Web hasSubPermission / hasWorkbenchNavAccess 对齐 */
function isTenantElevatedRole(tenantRole) {
  return tenantRole === 'owner';
}

function hasPermission(permissions, required) {
  if (!required) return true;
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  if (permissions.includes(required)) return true;
  const module = String(required).split(':')[0];
  if (module && permissions.includes(module)) return true;
  return permissions.some((p) => String(p).startsWith(`${module}:`));
}

/**
 * 单据查看范围（对齐 shared/types.ts resolveDocViewScope）：
 * - all：`<base>:view` 或裸模块键
 * - own：仅 `<base>:view_own`
 * - none：皆无
 */
function resolveDocViewScope(userPermissions, permBase) {
  const perms = Array.isArray(userPermissions) ? userPermissions : [];
  if (perms.length === 0) return 'none';
  const module = String(permBase).split(':')[0];
  if (module && perms.includes(module)) return 'all';
  if (perms.includes(`${permBase}:view`)) return 'all';
  if (perms.includes(`${permBase}:view_own`)) return 'own';
  return 'none';
}

/** 是否可进入该类单据入口（view 或 view_own；对齐 shared/types.ts canViewDocList） */
function canViewDocList(userPermissions, permBase) {
  return resolveDocViewScope(userPermissions, permBase) !== 'none';
}

/**
 * 页面门控：`xxx:view` 兼容 `xxx:view_own`（数据由后端过滤）。
 * 非 `:view` 后缀仍走 hasPermission。
 */
function hasDocViewPermission(permissions, viewPerm) {
  if (!viewPerm) return true;
  if (String(viewPerm).endsWith(':view')) {
    return canViewDocList(permissions, String(viewPerm).slice(0, -':view'.length));
  }
  return hasPermission(permissions, viewPerm);
}

/** 侧栏 / 数据看板：须显式授予 workbench 或 workbench:<pageId>；owner 恒 true */
function hasWorkbenchNavAccess(permissions, tenantRole) {
  if (isTenantElevatedRole(tenantRole)) return true;
  const perms = Array.isArray(permissions) ? permissions : [];
  return perms.includes('workbench') || perms.some((p) => String(p).startsWith('workbench:'));
}

function filterByPermission(items, permissions) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => hasPrefixPermission(permissions, item.permission));
}

/** 对齐 Web hasOrderPerm：精确匹配或 prefix:action 子权限 */
function hasPrefixPermission(permissions, prefix) {
  if (!prefix) return true;
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  if (permissions.includes(prefix)) return true;
  if (permissions.some((p) => String(p).startsWith(`${prefix}:`))) return true;
  const module = String(prefix).split(':')[0];
  if (module && permissions.includes(module)) return true;
  return permissions.some((p) => String(p).startsWith(`${module}:`));
}

module.exports = {
  hasPermission,
  hasDocViewPermission,
  hasPrefixPermission,
  filterByPermission,
  hasWorkbenchNavAccess,
  isTenantElevatedRole,
  resolveDocViewScope,
  canViewDocList,
};
