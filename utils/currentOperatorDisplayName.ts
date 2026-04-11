/**
 * 当前登录账号在成员/资料中的显示名，用于非「报工选工人」类单据的 operator 字段。
 * 与 AppDataContext 报工无 workerId 时的回退规则一致。
 */
export function currentOperatorDisplayName(user: Record<string, unknown> | null | undefined): string {
  if (!user) return '操作员';
  const dn = String((user as { displayName?: string }).displayName ?? '').trim();
  const un = String((user as { username?: string }).username ?? '').trim();
  return dn || un || '操作员';
}
