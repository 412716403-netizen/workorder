import type { PartnerCategory } from '../types';

/** 与快捷新建默认分类一致：先精确名「供应商」，再名称包含「供应商」 */
export function getSupplierCategoryId(categories: PartnerCategory[]): string | undefined {
  if (!categories.length) return undefined;
  const exact = categories.find(c => c.name.trim() === '供应商');
  if (exact) return exact.id;
  return categories.find(c => c.name.includes('供应商'))?.id;
}

/** 先精确名「客户」，再名称包含「客户」 */
export function getCustomerCategoryId(categories: PartnerCategory[]): string | undefined {
  if (!categories.length) return undefined;
  const exact = categories.find(c => c.name.trim() === '客户');
  if (exact) return exact.id;
  return categories.find(c => c.name.includes('客户'))?.id;
}
