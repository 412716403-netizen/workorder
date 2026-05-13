/**
 * 企业成员 `tenant_memberships.role`：拥有者与租户管理员视为满权（与后端 JWT / `resolveMemberPermissions` 一致）。
 */
export function isTenantElevatedRole(tenantRole: string | undefined): boolean {
  return tenantRole === 'owner' || tenantRole === 'admin';
}

/**
 * 通用模块级权限判断（纯函数，非 hook）。
 *
 * 逻辑（先匹配先赢）:
 *  1. owner / admin（租户管理员）→ 放行
 *  2. 权限列表为空或 undefined → 放行（向后兼容：未配置 = 全权限）
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
  if (!userPermissions || userPermissions.length === 0) return true;
  if (
    userPermissions.includes(moduleName) &&
    !userPermissions.some(p => p.startsWith(`${moduleName}:`))
  ) return true;
  if (userPermissions.includes(permKey)) return true;
  if (userPermissions.some(p => p.startsWith(`${permKey}:`))) return true;
  return false;
}
