/** 权限判断：与后端 hasSubPermission 规则对齐（精确匹配或持有顶级模块名） */
function hasPermission(permissions, required) {
  if (!required) return true;
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  if (permissions.includes(required)) return true;
  const module = String(required).split(':')[0];
  if (module && permissions.includes(module)) return true;
  return permissions.some((p) => String(p).startsWith(`${module}:`));
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
};
