import type { Partner, PrintRenderContext, ProductCategory } from '../types';

/** 打印上下文可一并注入的主数据（合作单位等），供 `{{产品.partner}}` 解析 */
export type PrintMasterDataForMerge = {
  partners?: Partner[];
  productCategories?: ProductCategory[];
};

/**
 * 为打印上下文补全当前租户公司名称，供 `{{租户.name}}` 解析。
 * 若 `ctx` 已由业务 builder 写入非空 `tenantName`，则不覆盖。
 * 可选注入合作单位 / 产品分类主数据；`ctx` 已有对应字段时不覆盖。
 */
export function mergeTenantPrintContext(
  ctx: PrintRenderContext,
  tenantName: string | null | undefined,
  master?: PrintMasterDataForMerge,
): PrintRenderContext {
  let next = ctx;
  const trimmed = tenantName?.trim();
  if (trimmed && !next.tenantName?.trim()) {
    next = { ...next, tenantName: trimmed };
  }
  if (master?.partners?.length && !next.partners?.length) {
    next = { ...next, partners: master.partners };
  }
  if (master?.productCategories?.length && !next.productCategories?.length) {
    next = { ...next, productCategories: master.productCategories };
  }
  return next;
}
