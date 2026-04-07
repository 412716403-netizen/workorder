import { useCallback, useMemo, useEffect } from 'react';

interface UseModulePermissionOptions {
  tenantRole?: string;
  userPermissions?: string[];
  moduleName?: string;
}

/**
 * Centralised permission check for module-level views.
 *
 * Logic (first match wins):
 *  1. tenant owner  → allow
 *  2. empty / missing permission list → allow (backward compat: unset = full access)
 *  3. module-level wildcard (e.g. `production` in list) AND no fine-grained
 *     sub-keys (e.g. no `production:*`) → allow everything in that module
 *  4. exact match on `permKey`
 *  5. prefix match (`permKey:` is a prefix of some entry) → allow
 */
export function useModulePermission({ tenantRole, userPermissions, moduleName }: UseModulePermissionOptions) {
  const isOwner = tenantRole === 'owner';

  const hasPerm = useCallback((permKey: string): boolean => {
    if (isOwner) return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (moduleName) {
      const hasModule = userPermissions.includes(moduleName);
      const hasFineGrained = userPermissions.some(p => p.startsWith(`${moduleName}:`));
      if (hasModule && !hasFineGrained) return true;
    }
    if (userPermissions.includes(permKey)) return true;
    if (userPermissions.some(p => p.startsWith(`${permKey}:`))) return true;
    return false;
  }, [isOwner, userPermissions, moduleName]);

  return { isOwner, hasPerm };
}

interface TabItem {
  id: string;
  [key: string]: unknown;
}

/**
 * Filter a tab list by `permGroups` (Record<tabId, permSubKey[]>) then
 * auto-reset `activeTab` when the current selection becomes invisible.
 *
 * `permPrefix` is prepended to each sub-key before calling `hasPerm`,
 * e.g. `permPrefix = 'production'` turns sub-key `plans` into `production:plans`.
 */
export function usePermFilteredTabs<T extends TabItem>({
  allTabs,
  permGroups,
  permPrefix,
  hasPerm,
  activeTab,
  setActiveTab,
}: {
  allTabs: T[];
  permGroups: Record<string, string[]>;
  permPrefix: string;
  hasPerm: (key: string) => boolean;
  activeTab: string;
  setActiveTab: (id: string) => void;
}) {
  const tabs = useMemo(
    () =>
      allTabs.filter(tab => {
        const keys = permGroups[tab.id];
        if (!keys) return true;
        return keys.some(k => hasPerm(`${permPrefix}:${k}`));
      }),
    [allTabs, permGroups, permPrefix, hasPerm],
  );

  const tabKey = tabs.map(t => t.id).join(',');
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabKey]);

  return tabs;
}
