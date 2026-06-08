/** 平台超级管理员（users.role === 'admin'，非租户 owner/admin） */
export function isPlatformAdmin(user: Record<string, unknown> | null | undefined): boolean {
  return user?.role === 'admin';
}
