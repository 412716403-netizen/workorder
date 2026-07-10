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
  hasPrefixPermission,
  filterByPermission,
  hasWorkbenchNavAccess,
  isTenantElevatedRole,
};
