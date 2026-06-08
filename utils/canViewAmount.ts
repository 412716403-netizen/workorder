import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AMOUNT_FINE_GRAINED_PERM_KEYS } from './amountPermissionKeys';
import { hasModulePerm, isTenantElevatedRole } from './hasModulePerm';

/** 各业务域「单价/金额查看」细粒度权限 key（单一事实源） */
export const AMOUNT_PERMISSION_KEYS = {
  PSI_PURCHASE_ORDER: 'psi:purchase_order:amount',
  PSI_PURCHASE_BILL: 'psi:purchase_bill:amount',
  PSI_SALES_ORDER: 'psi:sales_order:amount',
  PSI_SALES_BILL: 'psi:sales_bill:amount',
  OUTSOURCE: 'production:outsource_amount:allow',
  COLLABORATION: 'collaboration:amount:allow',
} as const;

/** 协作管理细粒度权限 key */
export const COLLABORATION_PERMISSION_KEYS = {
  LIST: 'collaboration:list:allow',
  AMOUNT: 'collaboration:amount:allow',
} as const;

export type AmountPermissionKey = (typeof AMOUNT_PERMISSION_KEYS)[keyof typeof AMOUNT_PERMISSION_KEYS];

/** PSI 单据 type → 金额权限 key */
export const PSI_DOC_TYPE_AMOUNT_KEY: Record<string, AmountPermissionKey> = {
  PURCHASE_ORDER: AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER,
  PURCHASE_BILL: AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_BILL,
  SALES_ORDER: AMOUNT_PERMISSION_KEYS.PSI_SALES_ORDER,
  SALES_BILL: AMOUNT_PERMISSION_KEYS.PSI_SALES_BILL,
};

/**
 * 是否可查看单价/金额。
 * 语义与 `useModulePermission().hasPerm` 一致：owner/admin、未配置细粒度、裸模块键 → 可见；
 * 细粒度角色需精确命中 amount/allow 键。
 */
export function canViewAmount(
  tenantRole: string | undefined,
  userPermissions: string[] | undefined,
  amountKey: string,
): boolean {
  if (!hasPriceAmountModuleAccess(tenantRole, userPermissions)) return false;
  if (
    userPermissions
    && userPermissions.includes('price_amount')
    && !AMOUNT_FINE_GRAINED_PERM_KEYS.some(k => userPermissions.includes(k))
    && !isTenantElevatedRole(tenantRole)
  ) {
    return true;
  }
  const [module] = amountKey.split(':');
  return hasModulePerm(tenantRole, userPermissions, module, amountKey);
}

/**
 * 单价/金额模块是否启用（角色编辑勾选 `price_amount`）。
 * 历史角色若已配置任一 amount 细粒度键但未勾选模块，仍视为启用以保持兼容。
 */
export function hasPriceAmountModuleAccess(
  tenantRole: string | undefined,
  userPermissions: string[] | undefined,
): boolean {
  if (isTenantElevatedRole(tenantRole)) return true;
  if (!userPermissions || userPermissions.length === 0) return true;
  if (userPermissions.includes('price_amount')) return true;
  return AMOUNT_FINE_GRAINED_PERM_KEYS.some(k => userPermissions.includes(k));
}

/** 已有 hasPerm 回调时的薄封装 */
export function canViewAmountViaHasPerm(
  hasPerm: (key: string) => boolean,
  amountKey: string,
): boolean {
  return hasPerm(amountKey);
}

/** React hook：当前用户是否可查看指定金额权限 key */
export function useCanViewAmount(amountKey: string): boolean {
  const { tenantCtx } = useAuth();
  return useMemo(
    () => canViewAmount(tenantCtx?.tenantRole, tenantCtx?.permissions, amountKey),
    [tenantCtx?.tenantRole, tenantCtx?.permissions, amountKey],
  );
}

/**
 * 是否启用协作管理模块（侧栏入口）。
 * 须勾选模块级 `collaboration`；仅有 `collaboration:*` 细粒度键不足以显示导航。
 */
export function hasCollaborationModuleAccess(
  tenantRole: string | undefined,
  userPermissions: string[] | undefined,
): boolean {
  if (isTenantElevatedRole(tenantRole)) return true;
  if (!userPermissions || userPermissions.length === 0) return true;
  return userPermissions.includes('collaboration');
}

/** 是否可访问协作列表/收件箱（须先有模块，再按 list 细粒度或裸模块全权限） */
export function canViewCollaborationList(
  tenantRole: string | undefined,
  userPermissions: string[] | undefined,
): boolean {
  if (!hasCollaborationModuleAccess(tenantRole, userPermissions)) return false;
  return hasModulePerm(tenantRole, userPermissions, 'collaboration', COLLABORATION_PERMISSION_KEYS.LIST);
}

export function useCanViewCollaborationList(): boolean {
  const { tenantCtx } = useAuth();
  return useMemo(
    () => canViewCollaborationList(tenantCtx?.tenantRole, tenantCtx?.permissions),
    [tenantCtx?.tenantRole, tenantCtx?.permissions],
  );
}
