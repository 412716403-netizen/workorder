/**
 * 首页快捷入口：对齐 Web useDashboardShortcuts + resolveShortcutItems
 */

const {
  WORKBENCH_SHORTCUT_CATALOG,
  DEFAULT_HOME_SHORTCUT_IDS,
  catalogItemToMenuItem,
} = require('../config/menus.js');
const { filterShortcutsByAccess } = require('./accessControl.js');

const catalogById = WORKBENCH_SHORTCUT_CATALOG.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

function isKnownShortcutId(id) {
  return Object.prototype.hasOwnProperty.call(catalogById, id);
}

function normalizeShortcutIds(raw) {
  if (!Array.isArray(raw)) return DEFAULT_HOME_SHORTCUT_IDS.slice();
  const seen = {};
  const out = [];
  raw.forEach((id) => {
    if (typeof id !== 'string' || !isKnownShortcutId(id) || seen[id]) return;
    seen[id] = true;
    out.push(id);
  });
  return out.length > 0 ? out : DEFAULT_HOME_SHORTCUT_IDS.slice();
}

function resolveShortcutItems(ids) {
  return normalizeShortcutIds(ids)
    .map((id) => catalogById[id])
    .filter(Boolean);
}

function buildHomeShortcuts(selectedIds, permissions, plugins, tenantRole) {
  const catalogItems = resolveShortcutItems(selectedIds);
  const filtered = filterShortcutsByAccess(catalogItems, plugins, tenantRole, permissions || []);
  return filtered.map(catalogItemToMenuItem).map((item) => ({
    key: item.key,
    label: item.label,
    icon: item.icon,
    path: item.path,
    permission: item.permission,
    pluginId: item.pluginId,
    fallbackChar: item.label ? String(item.label).charAt(0) : '?',
  }));
}

module.exports = {
  normalizeShortcutIds,
  resolveShortcutItems,
  buildHomeShortcuts,
};
