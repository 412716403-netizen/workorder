export {
  MilestoneStatus,
  OrderStatus,
  PlanStatus,
  FINANCE_DOC_NO_PREFIX,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER,
  BATCH_FIELD_MAX_LEN,
  BATCH_NO_UNTAGGED,
  normalizeBatchNo,
  isUntaggedBatch,
  batchNoForDisplay,
  batchNoForWrite,
  PSI_TYPES_WITH_BATCH_LINE,
  categoryUsesBatchManagement,
  normalizeCollabSpecLabel,
  COLLAB_ACCEPT_CATEGORY_DECISION,
  COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW,
  type CollabAcceptCategoryDecision,
  type CollabAcceptCreateProductPayload,
  type CollabAcceptTransferBody,
  type ProcessPricingMode,
  type ProductionLinkMode,
  type ProcessSequenceMode,
  type FinanceCategoryKind,
  type ProdOpType,
  type FinanceOpType,
  type CustomDocFieldType,
  type LegacyCustomDocFieldType,
  type ProductionOpCollabData,
} from '../../../shared/types.js';

export interface JwtPayload {
  userId: string;
  username: string;
  phone?: string;
  role: string;
  isEnterprise: boolean;
  tenantId?: string;
  tenantRole?: string;
  permissions?: string[];
}

export const ALL_PERMISSIONS = [
  'production', 'process_report', 'psi', 'finance', 'basic', 'settings', 'members', 'collaboration',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** 企业成员 `tenant_memberships.role`：拥有者与租户管理员（admin）视为满权 */
export function isTenantElevatedRole(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export const SETTINGS_SUB_MODULES = {
  categories:            { label: '产品分类管理',   actions: ['view', 'create', 'edit', 'delete'] as const },
  partner_categories:    { label: '合作单位分类',   actions: ['view', 'create', 'edit', 'delete'] as const },
  nodes:                 { label: '工序节点库',     actions: ['view', 'create', 'edit', 'delete'] as const },
  warehouses:            { label: '仓库分类管理',   actions: ['view', 'create', 'edit', 'delete'] as const },
  finance_categories:    { label: '收付款分类设置', actions: ['view', 'create', 'edit', 'delete'] as const },
  finance_account_types: { label: '收支账户类型',   actions: ['view', 'create', 'edit', 'delete'] as const },
  config:                { label: '业务配置',       actions: ['view', 'edit'] as const },
} as const;

export type SettingsSubModule = keyof typeof SETTINGS_SUB_MODULES;
export type SettingsAction = 'view' | 'create' | 'edit' | 'delete';

export const BASIC_SUB_MODULES = {
  products:     { label: '产品与BOM',     actions: ['view', 'create', 'edit', 'delete'] as const },
  partners:     { label: '合作单位',       actions: ['view', 'create', 'edit', 'delete'] as const },
  members:      { label: '成员管理',       actions: ['view', 'create', 'edit', 'delete'] as const },
  equipment:    { label: '设备管理',       actions: ['view', 'create', 'edit', 'delete'] as const },
  dictionaries: { label: '公共数据字典',   actions: ['view', 'create', 'edit', 'delete'] as const },
} as const;

export type BasicSubModule = keyof typeof BASIC_SUB_MODULES;

export function allSettingsPermissions(): string[] {
  const perms: string[] = [];
  for (const [mod, def] of Object.entries(SETTINGS_SUB_MODULES)) {
    for (const action of def.actions) {
      perms.push(`settings:${mod}:${action}`);
    }
  }
  return perms;
}

export function allBasicPermissions(): string[] {
  const perms: string[] = [];
  for (const [mod, def] of Object.entries(BASIC_SUB_MODULES)) {
    for (const action of def.actions) {
      perms.push(`basic:${mod}:${action}`);
    }
  }
  return perms;
}

export function hasSubPermission(
  userPermissions: string[],
  required: string,
): boolean {
  if (userPermissions.includes(required)) return true;
  const [module] = required.split(':');
  if (module && userPermissions.includes(module)) return true;
  return false;
}
