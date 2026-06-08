/** 工作台 / Dashboard 相关 React Query key（须含 tenantId，避免切换企业读到缓存） */
export function dashboardQueryKey(
  tenantId: string | undefined,
  segment: string,
  ...rest: string[]
): readonly string[] {
  return ['dashboard', tenantId ?? '', segment, ...rest];
}
