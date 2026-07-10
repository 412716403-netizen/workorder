/**
 * 企业成员 `tenant_memberships.role`：仅创建者 owner 视为满权。
 */
export function isTenantElevatedRole(tenantRole: string | undefined): boolean {
  return tenantRole === 'owner';
}

/**
 * 通用模块级权限判断（纯函数，非 hook）。
 *
 * 逻辑（先匹配先赢）:
 *  1. owner → 放行
 *  2. 权限列表为空或 undefined → 拒绝（成员未绑定角色 = 无业务权限）
 *  3. 持有模块级权限（如 `psi`）且无细粒度子键（如无 `psi:*`）→ 放行
 *  4. 精确匹配 permKey
 *  5. permKey 是某条目前缀 → 放行
 */
export function hasModulePerm(
  tenantRole: string | undefined,
  userPermissions: string[] | undefined,
  moduleName: string,
  permKey: string,
): boolean {
  if (isTenantElevatedRole(tenantRole)) return true;
  if (!userPermissions || userPermissions.length === 0) return false;
  if (
    userPermissions.includes(moduleName) &&
    !userPermissions.some(p => p.startsWith(`${moduleName}:`))
  ) return true;
  if (userPermissions.includes(permKey)) return true;
  if (userPermissions.some(p => p.startsWith(`${permKey}:`))) return true;
  return false;
}
