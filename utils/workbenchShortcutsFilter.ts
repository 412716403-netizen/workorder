import type { FeaturePluginsConfig } from '../types';
import { hasModulePerm, isTenantElevatedRole } from './hasModulePerm';
import { hasSubPermission } from './hasSubPermission';
import type { WorkbenchShortcutDefinition } from '../shared/workbenchShortcuts';

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
    if (item.perm && !hasSubPermission(permissions, item.perm)) return false;
    if (item.module && !hasModulePerm(tenantRole, permissions, item.module, item.module)) return false;
    return true;
  });
}
