/**
 * 工作台快捷入口目录（单一事实源）。
 * 导航时使用 href + location.state.tab 进入模块内子 Tab。
 */

export type WorkbenchShortcutIconKey =
  | 'CalendarRange'
  | 'ClipboardList'
  | 'ArrowUpFromLine'
  | 'Truck'
  | 'RotateCcw'
  | 'Receipt'
  | 'ShoppingBag'
  | 'CreditCard'
  | 'Warehouse'
  | 'ArrowDownCircle'
  | 'ArrowUpCircle'
  | 'Scale'
  | 'Boxes'
  | 'Building2'
  | 'ShieldCheck'
  | 'Cpu'
  | 'Library'
  | 'Inbox'
  | 'ScanLine'
  | 'FlaskConical'
  | 'BookOpen'
  | 'Settings';

export interface WorkbenchShortcutDefinition {
  id: string;
  label: string;
  /** 编辑弹窗分组标题 */
  group: string;
  href: string;
  /** 模块内子 Tab id，经 location.state.tab 传递 */
  tab?: string;
  icon: WorkbenchShortcutIconKey;
  module?: string;
  pluginId?: string;
  /** 细粒度 view 权限；缺省仅校验 module */
  perm?: string;
}

export const WORKBENCH_SHORTCUT_CATALOG: WorkbenchShortcutDefinition[] = [
  { id: 'production-plans', label: '生产计划', group: '生产管理', href: '/production', tab: 'plans', icon: 'CalendarRange', module: 'production' },
  { id: 'production-orders', label: '工单中心', group: '生产管理', href: '/production', tab: 'orders', icon: 'ClipboardList', module: 'production' },
  { id: 'production-stock-out', label: '生产物料', group: '生产管理', href: '/production', tab: 'STOCK_OUT', icon: 'ArrowUpFromLine', module: 'production', perm: 'production:stock_out:view' },
  { id: 'production-outsource', label: '外协管理', group: '生产管理', href: '/production', tab: 'OUTSOURCE', icon: 'Truck', module: 'production', perm: 'production:outsource:view' },
  { id: 'production-rework', label: '返工管理', group: '生产管理', href: '/production', tab: 'REWORK', icon: 'RotateCcw', module: 'production', perm: 'production:rework:view' },

  { id: 'psi-purchase-order', label: '采购订单', group: '进销存', href: '/psi', tab: 'PURCHASE_ORDER', icon: 'ClipboardList', module: 'psi', perm: 'psi:purchase_order:view' },
  { id: 'psi-purchase-bill', label: '采购入库', group: '进销存', href: '/psi', tab: 'PURCHASE_BILL', icon: 'Receipt', module: 'psi', perm: 'psi:purchase_bill:view' },
  { id: 'psi-sales-order', label: '销售订单', group: '进销存', href: '/psi', tab: 'SALES_ORDER', icon: 'ShoppingBag', module: 'psi', perm: 'psi:sales_order:view' },
  { id: 'psi-sales-bill', label: '销售单', group: '进销存', href: '/psi', tab: 'SALES_BILL', icon: 'CreditCard', module: 'psi', perm: 'psi:sales_bill:view' },
  { id: 'psi-warehouse', label: '仓库管理', group: '进销存', href: '/psi', tab: 'WAREHOUSE_MGMT', icon: 'Warehouse', module: 'psi', perm: 'psi:warehouse_list:view' },

  { id: 'finance-receipt', label: '收款单', group: '财务结算', href: '/finance', tab: 'RECEIPT', icon: 'ArrowDownCircle', module: 'finance', perm: 'finance:receipt:view' },
  { id: 'finance-payment', label: '付款单', group: '财务结算', href: '/finance', tab: 'PAYMENT', icon: 'ArrowUpCircle', module: 'finance', perm: 'finance:payment:view' },
  { id: 'finance-reconciliation', label: '财务对账', group: '财务结算', href: '/finance', tab: 'RECONCILIATION', icon: 'Scale', module: 'finance', perm: 'finance:reconciliation:allow' },

  { id: 'basic-products', label: '产品与 BOM', group: '基础信息', href: '/basic', tab: 'PRODUCTS', icon: 'Boxes', module: 'basic', perm: 'basic:products:view' },
  { id: 'basic-partners', label: '合作单位', group: '基础信息', href: '/basic', tab: 'PARTNERS', icon: 'Building2', module: 'basic', perm: 'basic:partners:view' },
  { id: 'basic-members', label: '成员管理', group: '基础信息', href: '/basic', tab: 'MEMBERS', icon: 'ShieldCheck', module: 'basic', perm: 'basic:members:view' },
  { id: 'basic-equipment', label: '设备管理', group: '基础信息', href: '/basic', tab: 'EQUIPMENT', icon: 'Cpu', module: 'basic', perm: 'basic:equipment:view' },
  { id: 'basic-dictionaries', label: '公共数据字典', group: '基础信息', href: '/basic', tab: 'DICTIONARIES', icon: 'Library', module: 'basic', perm: 'basic:dictionaries:view' },

  { id: 'collaboration-inbox', label: '协作管理', group: '协作', href: '/collaboration', icon: 'Inbox', module: 'collaboration', pluginId: 'collaboration' },
  { id: 'trace-scan', label: '扫码追溯', group: '工具', href: '/trace', icon: 'ScanLine', pluginId: 'virtual_batch' },
  { id: 'development', label: '开发管理', group: '开发', href: '/development', icon: 'FlaskConical', module: 'development', pluginId: 'development' },
  { id: 'knowledge-base', label: '资料库', group: '工具', href: '/knowledge-base', icon: 'BookOpen', module: 'knowledge_base', pluginId: 'knowledge_base' },
  { id: 'settings', label: '系统设置', group: '系统', href: '/settings', tab: 'categories', icon: 'Settings', module: 'settings', perm: 'settings:categories:view' },
];

export const DEFAULT_DASHBOARD_SHORTCUT_IDS: string[] = [
  'production-plans',
  'production-orders',
  'psi-purchase-order',
  'psi-sales-order',
  'finance-receipt',
  'collaboration-inbox',
  'basic-products',
  'trace-scan',
];

const catalogMap = new Map(WORKBENCH_SHORTCUT_CATALOG.map(s => [s.id, s]));

export function getShortcutDefinition(id: string): WorkbenchShortcutDefinition | undefined {
  return catalogMap.get(id);
}

export function isKnownShortcutId(id: string): boolean {
  return catalogMap.has(id);
}

/** 归一化用户选择的快捷 id 列表（去重、过滤未知、补默认） */
export function normalizeShortcutIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_DASHBOARD_SHORTCUT_IDS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !isKnownShortcutId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length > 0 ? out : [...DEFAULT_DASHBOARD_SHORTCUT_IDS];
}

export function resolveShortcutItems(ids: string[]): WorkbenchShortcutDefinition[] {
  return normalizeShortcutIds(ids)
    .map(id => getShortcutDefinition(id))
    .filter((s): s is WorkbenchShortcutDefinition => s != null);
}
