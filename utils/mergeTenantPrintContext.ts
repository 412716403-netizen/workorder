import type { PrintRenderContext } from '../types';

/**
 * 为打印上下文补全当前租户公司名称，供 `{{租户.name}}` 解析。
 * 若 `ctx` 已由业务 builder 写入非空 `tenantName`，则不覆盖。
 */
export function mergeTenantPrintContext(
  ctx: PrintRenderContext,
  tenantName: string | null | undefined,
): PrintRenderContext {
  const trimmed = tenantName?.trim();
  if (!trimmed) return ctx;
  if (ctx.tenantName?.trim()) return ctx;
  return { ...ctx, tenantName: trimmed };
}
