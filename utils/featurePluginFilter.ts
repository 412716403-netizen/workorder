import type { FeaturePluginsConfig } from '../types';
import { hasModulePerm } from './hasModulePerm';

/** 功能插件 + RBAC：侧栏与 widget 可见性 */
export function isFeatureNavVisible(
  pluginId: string,
  modulePerm: string | null,
  plugins: FeaturePluginsConfig,
  hasPerm: (m: string) => boolean,
): boolean {
  if (plugins[pluginId] === false) return false;
  if (!modulePerm) return true;
  return hasPerm(modulePerm);
}

export function filterShortcutsByAccess<T extends { pluginId?: string; module?: string }>(
  items: T[],
  plugins: FeaturePluginsConfig,
  tenantRole: string | undefined,
  permissions: string[],
): T[] {
  return items.filter(item => {
    if (item.pluginId && plugins[item.pluginId] === false) return false;
    if (item.module && !hasModulePerm(tenantRole, permissions, item.module, item.module)) return false;
    return true;
  });
}
