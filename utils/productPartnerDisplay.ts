import type { Partner, Product, ProductCategory } from '../types';

/**
 * 产品关联的合作单位名称（产品档案「合作单位」字段，存 `Product.supplierId`）。
 * 仅当所属分类开启 `linkPartner` 时才视为有效，与产品档案表单/详情的显示条件一致。
 * 未开启、未关联或合作单位已删除时返回 null。
 */
export function resolveProductPartnerName(
  product: Pick<Product, 'supplierId'> | { supplierId?: string | null },
  category: ProductCategory | null | undefined,
  partnerNameById: ReadonlyMap<string, string>,
): string | null {
  if (!category?.linkPartner) return null;
  const id = (product.supplierId ?? '').trim();
  if (!id) return null;
  return partnerNameById.get(id)?.trim() || null;
}

/** 由合作单位列表构建 id → 名称索引，供列表逐行解析时复用 */
export function buildPartnerNameById(partners: readonly Partner[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of partners) {
    if (p.id) map.set(p.id, p.name ?? '');
  }
  return map;
}
