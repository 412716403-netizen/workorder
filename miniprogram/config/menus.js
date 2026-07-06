/**
 * 小程序入口菜单配置
 * 应用中心与 Web shared/workbenchShortcuts.ts WORKBENCH_SHORTCUT_CATALOG 保持同步
 */

const { filterByPermission } = require('../utils/permissions.js');

const ICON = (name) => `/assets/icons/${name}.png`;

/** Web WorkbenchShortcutIconKey → lucide PNG 文件名 */
const LUCIDE_ICON_FILES = {
  CalendarRange: 'calendar-range',
  ClipboardList: 'clipboard-list',
  ArrowUpFromLine: 'arrow-up-from-line',
  Truck: 'truck',
  RotateCcw: 'rotate-ccw',
  Receipt: 'receipt',
  ShoppingBag: 'shopping-bag',
  CreditCard: 'credit-card',
  Warehouse: 'warehouse',
  ArrowDownCircle: 'arrow-down-circle',
  ArrowUpCircle: 'arrow-up-circle',
  Scale: 'scale',
  Boxes: 'boxes',
  Building2: 'building-2',
  ShieldCheck: 'shield-check',
  Cpu: 'cpu',
  Library: 'library',
  Inbox: 'inbox',
  ScanLine: 'scan-line',
  FlaskConical: 'flask-conical',
  BookOpen: 'book-open',
  Settings: 'settings',
};

/** 与 shared/workbenchShortcuts.ts WORKBENCH_SHORTCUT_CATALOG 一致 */
const WORKBENCH_SHORTCUT_CATALOG = [
  { id: 'production-plans', label: '生产计划', group: '生产管理', icon: 'CalendarRange', module: 'production', perm: 'production:plans:view', path: '/pages/production-plans/production-plans' },
  { id: 'production-orders', label: '工单中心', group: '生产管理', icon: 'ClipboardList', module: 'production', perm: 'production:orders_list:allow', path: '/pages/production-orders/production-orders' },
  { id: 'production-stock-out', label: '生产物料', group: '生产管理', icon: 'ArrowUpFromLine', module: 'production', perm: 'production:material_list', path: '/pages/production-stock-out/production-stock-out' },
  { id: 'production-outsource', label: '外协管理', group: '生产管理', icon: 'Truck', module: 'production', perm: 'production:outsource:view', path: '/pages/production-outsource/production-outsource' },
  { id: 'production-rework', label: '返工管理', group: '生产管理', icon: 'RotateCcw', module: 'production', perm: 'production:rework:view', path: '/pages/production-rework/production-rework' },

  { id: 'psi-purchase-order', label: '采购订单', group: '进销存', icon: 'ClipboardList', module: 'psi', perm: 'psi:purchase_order:view', path: '/pages/psi-purchase-orders/psi-purchase-orders' },
  { id: 'psi-purchase-bill', label: '采购入库', group: '进销存', icon: 'Receipt', module: 'psi', perm: 'psi:purchase_bill:view', path: '/pages/psi-purchase-bills/psi-purchase-bills' },
  { id: 'psi-sales-order', label: '销售订单', group: '进销存', icon: 'ShoppingBag', module: 'psi', perm: 'psi:sales_order:view', path: '/pages/psi-sales-orders/psi-sales-orders' },
  { id: 'psi-sales-bill', label: '销售单', group: '进销存', icon: 'CreditCard', module: 'psi', perm: 'psi:sales_bill:view', path: '/pages/psi-sales-bills/psi-sales-bills' },
  { id: 'psi-warehouse', label: '仓库管理', group: '进销存', icon: 'Warehouse', module: 'psi', perm: 'psi:warehouse_list:view', path: '/pages/psi-warehouses/psi-warehouses' },

  { id: 'finance-receipt', label: '收款单', group: '财务结算', icon: 'ArrowDownCircle', module: 'finance', perm: 'finance:receipt:view' },
  { id: 'finance-payment', label: '付款单', group: '财务结算', icon: 'ArrowUpCircle', module: 'finance', perm: 'finance:payment:view' },
  { id: 'finance-reconciliation', label: '财务对账', group: '财务结算', icon: 'Scale', module: 'finance', perm: 'finance:reconciliation:allow' },

  { id: 'basic-products', label: '产品与 BOM', group: '基础信息', icon: 'Boxes', module: 'basic', perm: 'basic:products:view' },
  { id: 'basic-partners', label: '合作单位', group: '基础信息', icon: 'Building2', module: 'basic', perm: 'basic:partners:view' },
  { id: 'basic-members', label: '成员管理', group: '基础信息', icon: 'ShieldCheck', module: 'basic', perm: 'basic:members:view' },
  { id: 'basic-equipment', label: '设备管理', group: '基础信息', icon: 'Cpu', module: 'basic', perm: 'basic:equipment:view' },
  { id: 'basic-dictionaries', label: '公共数据字典', group: '基础信息', icon: 'Library', module: 'basic', perm: 'basic:dictionaries:view' },
  { id: 'settings', label: '系统设置', group: '基础信息', icon: 'Settings', module: 'settings', perm: 'settings:categories:view', path: '/pages/settings/settings' },

  { id: 'collaboration-inbox', label: '协作管理', group: '插件中心', icon: 'Inbox', module: 'collaboration', pluginId: 'collaboration', path: '/pages/messages/messages' },
  { id: 'trace-scan', label: '扫码追溯', group: '插件中心', icon: 'ScanLine', pluginId: 'traceability', path: '/pages/scan/scan' },
  { id: 'knowledge-base', label: '资料库', group: '插件中心', icon: 'BookOpen', module: 'knowledge_base', pluginId: 'knowledge_base' },
  { id: 'development', label: '开发管理', group: '插件中心', icon: 'FlaskConical', module: 'development', pluginId: 'development' },
];

const GROUP_KEYS = {
  生产管理: 'production',
  进销存: 'psi',
  财务结算: 'finance',
  基础信息: 'basic',
  插件中心: 'plugins',
  系统: 'system',
};

/** 小程序应用中心分组展示顺序（插件中心置顶） */
const APP_GROUP_ORDER = ['插件中心', '生产管理', '进销存', '财务结算', '基础信息'];

function shortcutPermission(item) {
  if (item.perm) return item.perm;
  if (item.module) return item.module;
  return '';
}

function catalogItemToMenuItem(item) {
  const iconFile = LUCIDE_ICON_FILES[item.icon];
  return {
    key: item.id,
    label: item.label,
    icon: iconFile ? ICON(iconFile) : '',
    path: item.path || '',
    permission: shortcutPermission(item),
    pluginId: item.pluginId,
    fallbackChar: item.label ? String(item.label).charAt(0) : '?',
  };
}

function buildAppCategoriesFromCatalog() {
  const byTitle = new Map();

  for (const item of WORKBENCH_SHORTCUT_CATALOG) {
    let cat = byTitle.get(item.group);
    if (!cat) {
      cat = {
        key: GROUP_KEYS[item.group] || item.group,
        title: item.group,
        items: [],
      };
      byTitle.set(item.group, cat);
    }
    cat.items.push(catalogItemToMenuItem(item));
  }

  const ordered = [];
  APP_GROUP_ORDER.forEach((title) => {
    const cat = byTitle.get(title);
    if (cat) ordered.push(cat);
  });
  byTitle.forEach((cat, title) => {
    if (!APP_GROUP_ORDER.includes(title)) ordered.push(cat);
  });
  return ordered;
}

/** 与 Web DEFAULT_DASHBOARD_SHORTCUT_IDS 一致 */
const DEFAULT_HOME_SHORTCUT_IDS = [
  'production-plans',
  'production-orders',
  'psi-purchase-order',
  'psi-sales-order',
  'finance-receipt',
  'collaboration-inbox',
  'basic-products',
  'trace-scan',
];

/** @deprecated 使用 DEFAULT_HOME_SHORTCUT_IDS */
const HOME_SHORTCUT_IDS = DEFAULT_HOME_SHORTCUT_IDS;

const HOME_ICON_CHARS = {
  'production-plans': '生',
  'production-orders': '工',
  'psi-purchase-order': '采',
  'psi-sales-order': '销',
  'finance-receipt': '收',
};

const catalogById = WORKBENCH_SHORTCUT_CATALOG.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

const HOME_QUICK_ENTRIES = HOME_SHORTCUT_IDS.map((id) => {
  const item = catalogById[id];
  const menu = catalogItemToMenuItem(item);
  const iconChar = HOME_ICON_CHARS[id];
  if (!iconChar) return menu;
  return {
    key: menu.key,
    label: menu.label,
    icon: menu.icon,
    path: menu.path,
    permission: menu.permission,
    pluginId: menu.pluginId,
    iconChar,
  };
});

/** 应用中心（与 Web 工作台快捷入口目录分组一致） */
const APP_CATEGORIES = buildAppCategoriesFromCatalog();

const APPS_PAGE_PATH = '/pages/apps/apps';
const HOME_QUICK_LIMIT = 8;

/** 扁平化全部应用（兼容旧逻辑） */
const APP_ENTRIES = APP_CATEGORIES.flatMap((c) => c.items);

/**
 * 按权限与关键词生成分组应用列表
 * @param {string[]} permissions
 * @param {string} keyword
 */
function buildAppCategories(permissions, keyword) {
  const kw = (keyword || '').trim().toLowerCase();
  return APP_CATEGORIES.map((cat) => {
    let items = filterByPermission(cat.items, permissions);
    if (kw) {
      items = items.filter((it) => it.label.toLowerCase().includes(kw));
    }
    return { ...cat, items };
  }).filter((cat) => cat.items.length > 0);
}

module.exports = {
  HOME_QUICK_ENTRIES,
  APP_ENTRIES,
  APP_CATEGORIES,
  WORKBENCH_SHORTCUT_CATALOG,
  DEFAULT_HOME_SHORTCUT_IDS,
  catalogItemToMenuItem,
  APPS_PAGE_PATH,
  HOME_QUICK_LIMIT,
  buildAppCategories,
};
