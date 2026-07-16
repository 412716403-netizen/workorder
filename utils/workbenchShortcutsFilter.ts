import type { FeaturePluginsConfig } from '../types';
import { hasModulePerm, isTenantElevatedRole } from './hasModulePerm';
import { hasSubPermission } from './hasSubPermission';
import { canViewDocList } from '../shared/types';
import type { WorkbenchShortcutDefinition } from '../shared/workbenchShortcuts';

/**
 * 快捷入口 `perm`（细粒度 view 键）判断：
 * `:view` 结尾时兼容「仅本人可见」——持有 `<base>:view_own` 同样可进入口（数据由后端过滤）。
 */
function hasShortcutPerm(permissions: string[], perm: string): boolean {
  if (perm.endsWith(':view')) {
    return canViewDocList(permissions, perm.slice(0, -':view'.length));
  }
  return hasSubPermission(permissions, perm);
}

function hasAnySubModulePerm(
  permissions: string[],
  module: string,
  subKeys: string[],
): boolean {
  return subKeys.some((k) => {
    const base = `${module}:${k}`;
    if (hasSubPermission(permissions, base)) return true;
    return permissions.some((p) => p.startsWith(`${base}:`));
  });
}

/** 快捷入口：功能插件 + RBAC（含细粒度 perm） */
export function filterWorkbenchShortcutsByAccess(
  items: WorkbenchShortcutDefinition[],
  plugins: FeaturePluginsConfig,
  tenantRole: string | undefined,
  permissions: string[],
): WorkbenchShortcutDefinition[] {
  return items.filter(item => {
    if (item.pluginId && plugins[item.pluginId] === false) return false;
    if (isTenantElevatedRole(tenantRole)) return true;
    if (item.permAnyOf?.length && item.module) {
      if (!hasAnySubModulePerm(permissions, item.module, item.permAnyOf)) return false;
    } else if (item.perm && !hasShortcutPerm(permissions, item.perm)) return false;
    if (item.module && !hasModulePerm(tenantRole, permissions, item.module, item.module)) return false;
    return true;
  });
}
