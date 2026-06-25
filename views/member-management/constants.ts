import type { RoleRow } from '../../services/api';
import { PRICE_AMOUNT_SUB_MODULES } from '../../utils/amountPermissionKeys';

export const ALL_PERMISSIONS = [
  { id: 'knowledge_base', label: '资料库' },
  { id: 'development', label: '开发管理' },
  { id: 'production', label: '生产管理' },
  { id: 'process_report', label: '工序报工' },
  { id: 'psi', label: '进销存' },
  { id: 'finance', label: '财务结算' },
  { id: 'price_amount', label: '单价/金额' },
  { id: 'basic', label: '基础信息' },
  { id: 'collaboration', label: '协作管理' },
  { id: 'settings', label: '系统设置' },
];

export const SETTINGS_SUB_MODULES: { key: string; label: string; actions: string[] }[] = [
  { key: 'categories',            label: '产品分类管理',   actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'partner_categories',    label: '合作单位分类',   actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'nodes',                 label: '工序节点库',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'warehouses',            label: '仓库分类管理',   actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'finance_categories',    label: '收付款分类设置', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'finance_account_types', label: '收支账户类型',   actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'config',                label: '业务配置',       actions: ['view', 'edit'] },
];

export const KNOWLEDGE_BASE_SUB_MODULES: { key: string; label: string; actions: string[] }[] = [
  { key: 'folders', label: '文件夹', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'documents', label: '文档', actions: ['view', 'create', 'edit', 'delete'] },
];

export const DEVELOPMENT_SUB_MODULES: { key: string; label: string; actions: string[] }[] = [
  { key: 'styles', label: '款式开发', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'templates', label: '开发流程模板', actions: ['view', 'create', 'edit', 'delete'] },
];

export const BASIC_SUB_MODULES: { key: string; label: string; actions: string[] }[] = [
  { key: 'products',     label: '产品与BOM',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'partners',     label: '合作单位',       actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'members',      label: '成员管理',       actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'equipment',    label: '设备管理',       actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'dictionaries', label: '公共数据字典',   actions: ['view', 'create', 'edit', 'delete'] },
];

export const PRODUCTION_SUB_MODULES: { key: string; label: string; actions: string[]; group: string }[] = [
  { key: 'plans', label: '生产计划', actions: ['view', 'create', 'edit', 'delete'], group: '生产计划' },
  { key: 'orders_list', label: '主列表', actions: ['allow'], group: '工单中心' },
  { key: 'orders_form_config', label: '表单配置', actions: ['allow'], group: '工单中心' },
  { key: 'orders_report_records', label: '报工流水', actions: ['view', 'create', 'edit', 'delete'], group: '工单中心' },
  { key: 'orders_pending_stock_in', label: '待入库流水', actions: ['view', 'create', 'edit', 'delete'], group: '工单中心' },
  { key: 'orders_detail', label: '工单详情', actions: ['view', 'edit', 'delete'], group: '工单中心' },
  { key: 'orders_material', label: '物料', actions: ['allow'], group: '工单中心' },
  { key: 'orders_rework', label: '返工', actions: ['allow'], group: '工单中心' },
  { key: 'material_list', label: '主列表', actions: ['allow'], group: '生产物料' },
  { key: 'material_records', label: '领料退料流水', actions: ['view', 'edit', 'delete'], group: '生产物料' },
  { key: 'material_form_config', label: '表单配置', actions: ['allow'], group: '生产物料' },
  { key: 'material_issue', label: '领料发出', actions: ['allow'], group: '生产物料' },
  { key: 'material_return', label: '生产退料', actions: ['allow'], group: '生产物料' },
  { key: 'outsource_form_config', label: '表单配置', actions: ['allow'], group: '外协管理' },
  { key: 'outsource_list', label: '主列表', actions: ['allow'], group: '外协管理' },
  { key: 'outsource_send', label: '待发清单', actions: ['allow'], group: '外协管理' },
  { key: 'outsource_receive', label: '待收回清单', actions: ['allow'], group: '外协管理' },
  { key: 'outsource_records', label: '外协流水', actions: ['view', 'edit', 'delete'], group: '外协管理' },
  { key: 'outsource_material', label: '物料外发', actions: ['allow'], group: '外协管理' },
  { key: 'rework_list', label: '主列表', actions: ['allow'], group: '返工管理' },
  { key: 'rework_defective', label: '待处理不良', actions: ['allow'], group: '返工管理' },
  { key: 'rework_records', label: '处理不良流水', actions: ['view', 'edit', 'delete'], group: '返工管理' },
  { key: 'rework_report_records', label: '返工报工流水', actions: ['view', 'edit', 'delete'], group: '返工管理' },
  { key: 'rework_outsource', label: '委外返工', actions: ['allow'], group: '返工管理' },
  { key: 'rework_detail', label: '详情', actions: ['allow'], group: '返工管理' },
  { key: 'rework_material', label: '物料', actions: ['allow'], group: '返工管理' },
  { key: 'rework_form_config', label: '表单配置', actions: ['allow'], group: '返工管理' },
];

export const PSI_SUB_MODULES: { key: string; label: string; actions: string[]; group: string }[] = [
  { key: 'purchase_order', label: '采购订单', actions: ['view', 'create', 'edit', 'delete'], group: '采购订单' },
  { key: 'purchase_bill', label: '采购入库', actions: ['view', 'create', 'edit', 'delete'], group: '采购入库' },
  { key: 'sales_order', label: '销售订单', actions: ['view', 'create', 'edit', 'delete'], group: '销售订单' },
  { key: 'sales_order_allocation', label: '配货', actions: ['allow'], group: '销售订单' },
  { key: 'sales_order_pending_shipment', label: '待发货清单', actions: ['allow'], group: '销售订单' },
  { key: 'sales_bill', label: '销售单', actions: ['view', 'create', 'edit', 'delete'], group: '销售单' },
  { key: 'warehouse_list', label: '主列表', actions: ['allow'], group: '仓库管理' },
  { key: 'warehouse_stocktake', label: '盘点单', actions: ['view', 'create', 'edit', 'delete'], group: '仓库管理' },
  { key: 'warehouse_transfer', label: '调拨单', actions: ['view', 'create', 'edit', 'delete'], group: '仓库管理' },
  { key: 'warehouse_flow', label: '仓库流水', actions: ['allow'], group: '仓库管理' },
];

export const FINANCE_SUB_MODULES: { key: string; label: string; actions: string[]; group: string }[] = [
  { key: 'receipt', label: '收款单', actions: ['view', 'create', 'edit', 'delete'], group: '收款单' },
  { key: 'payment', label: '付款单', actions: ['view', 'create', 'edit', 'delete'], group: '付款单' },
  { key: 'account', label: '资金账户', actions: ['view'], group: '资金账户' },
  { key: 'transfer', label: '账户转账', actions: ['create', 'view'], group: '资金账户' },
  { key: 'reconciliation', label: '财务对帐', actions: ['allow'], group: '财务对帐' },
];

export const COLLABORATION_SUB_MODULES: { key: string; label: string; actions: string[]; group: string }[] = [
  { key: 'list', label: '列表', actions: ['allow'], group: '列表' },
];

export {
  AMOUNT_FINE_GRAINED_PERM_KEYS,
  PRICE_AMOUNT_SUB_MODULES,
  type PriceAmountSubModule,
} from '../../utils/amountPermissionKeys';

export const ACTION_LABELS: Record<string, string> = {
  view: '查看',
  create: '添加',
  edit: '编辑',
  delete: '删除',
};

export type Member = {
  id: string; userId: string; username: string; phone?: string;
  displayName?: string; role: string; permissions: unknown;
  roleId?: string | null; roleName?: string | null;
  assignedMilestoneIds?: string[];
  joinedAt: string;
};

export type Application = {
  id: string; userId: string; status: string; message?: string;
  user: { id: string; username: string; phone?: string; displayName?: string };
  createdAt: string;
};

export function resolveMemberPermsLocal(m: Member, rolesList: RoleRow[]): string[] {
  if (m.role === 'owner') return ALL_PERMISSIONS.map(p => p.id);
  if (m.roleId && m.roleName) {
    const role = rolesList.find(r => r.id === m.roleId);
    if (role) return Array.isArray(role.permissions) ? role.permissions as string[] : [];
  }
  return Array.isArray(m.permissions) ? m.permissions as string[] : [];
}

export function memberHasReportPerm(m: Member, rolesList: RoleRow[]): boolean {
  if (m.role === 'owner') return true;
  const perms = resolveMemberPermsLocal(m, rolesList);
  if (perms.includes('process_report')) return true;
  return false;
}

export function permSummary(perms: string[]): string {
  const settingsCount = SETTINGS_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`settings:${sm.key}:`))).length;
  const developmentCount = DEVELOPMENT_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`development:${sm.key}:`))).length;
  const basicCount = BASIC_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`basic:${sm.key}:`))).length;
  const productionCount = PRODUCTION_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`production:${sm.key}:`))).length;
  const psiCount = PSI_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`psi:${sm.key}:`))).length;
  const financeCount = FINANCE_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`finance:${sm.key}:`))).length;
  const collaborationCount = COLLABORATION_SUB_MODULES.filter(sm =>
    perms.some(p => p.startsWith(`collaboration:${sm.key}:`)),
  ).length;
  const priceAmountCount = PRICE_AMOUNT_SUB_MODULES.filter(sm => perms.includes(sm.permKey)).length;
  const modules = ALL_PERMISSIONS
    .filter(p => perms.includes(p.id))
    .map(p => {
      if (p.id === 'settings' && settingsCount > 0) return `${p.label}(${settingsCount}项)`;
      if (p.id === 'development' && developmentCount > 0) return `${p.label}(${developmentCount}项)`;
      if (p.id === 'basic' && basicCount > 0) return `${p.label}(${basicCount}项)`;
      if (p.id === 'production' && productionCount > 0) return `${p.label}(${productionCount}项)`;
      if (p.id === 'psi' && psiCount > 0) return `${p.label}(${psiCount}项)`;
      if (p.id === 'finance' && financeCount > 0) return `${p.label}(${financeCount}项)`;
      if (p.id === 'collaboration' && collaborationCount > 0) return `${p.label}(${collaborationCount}项)`;
      if (p.id === 'price_amount' && priceAmountCount > 0) return `${p.label}(${priceAmountCount}项)`;
      return p.label;
    });
  if (!perms.includes('settings') && settingsCount > 0) modules.push(`系统设置(${settingsCount}项)`);
  if (!perms.includes('development') && developmentCount > 0) modules.push(`开发管理(${developmentCount}项)`);
  if (!perms.includes('basic') && basicCount > 0) modules.push(`基础信息(${basicCount}项)`);
  if (!perms.includes('production') && productionCount > 0) modules.push(`生产管理(${productionCount}项)`);
  if (!perms.includes('psi') && psiCount > 0) modules.push(`进销存(${psiCount}项)`);
  if (!perms.includes('finance') && financeCount > 0) modules.push(`财务结算(${financeCount}项)`);
  if (!perms.includes('collaboration') && collaborationCount > 0) modules.push(`协作管理(${collaborationCount}项)`);
  if (!perms.includes('price_amount') && priceAmountCount > 0) modules.push(`单价/金额(${priceAmountCount}项)`);
  return modules.length > 0 ? modules.join('、') : '无权限';
}
