/**
 * 前端细粒度权限判断，与后端 `backend/src/types/index.ts` 的 hasSubPermission 行为一致：
 * - 持有精确权限视为有权
 * - 持有顶级模块权限（如 `basic`）视为拥有该模块下所有子权限
 */
export function hasSubPermission(
  userPermissions: string[] | null | undefined,
  required: string,
): boolean {
  if (!userPermissions || userPermissions.length === 0) return false;
  if (userPermissions.includes(required)) return true;
  const [module] = required.split(':');
  if (module && userPermissions.includes(module)) return true;
  return false;
}
