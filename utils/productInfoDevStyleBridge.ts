import type { DevStyleDto, Product } from '../types';
import { DevStyleStatus } from '../types';
import { devStyleToProductForBom } from './devStyleToProduct';

/** 开发款式 → 与产品档案一致的编辑形状（sku = 款号/产品名称） */
export function devStyleToProductInfo(style: DevStyleDto): Product {
  return devStyleToProductForBom(style);
}

/** 将产品档案字段写回 DevStyle（保留 id、样品轮次、状态等开发专属字段） */
export function patchDevStyleFromProduct(base: DevStyleDto, product: Product): DevStyleDto {
  return {
    ...base,
    code: product.sku,
    name: product.name,
    categoryId: product.categoryId,
    imageUrl: product.imageUrl,
    unitId: product.unitId,
    supplierId: product.supplierId,
    salesPrice: product.salesPrice,
    purchasePrice: product.purchasePrice,
    colorIds: product.colorIds ?? [],
    sizeIds: product.sizeIds ?? [],
    categoryCustomData: product.categoryCustomData ?? {},
    milestoneNodeIds: product.milestoneNodeIds ?? base.milestoneNodeIds,
    variants: (product.variants ?? []).map((v) => ({
      id: v.id,
      colorId: v.colorId,
      sizeId: v.sizeId,
      skuSuffix: v.skuSuffix,
      nodeBoms: v.nodeBoms ?? {},
    })),
  };
}

/**
 * 仅在「已发布且只读」时用产品档案覆盖展示字段。
 * 还原至开发中后款式本身是编辑真源（保存时再回写产品）；若此时仍覆盖：
 * 1) 输入失焦会被档案旧值盖回（看起来改不动，保存却是新值）；
 * 2) 变体会被换成产品档案的 variant id，试制 BOM 对不上。
 */
export function resolveDevStyleWithPublishedProduct(
  style: DevStyleDto,
  products: Product[],
): DevStyleDto {
  if (style.status !== DevStyleStatus.PUBLISHED || !style.publishedProductId) return style;
  const published = products.find((p) => p.id === style.publishedProductId);
  if (!published) return style;
  return patchDevStyleFromProduct(style, published);
}
