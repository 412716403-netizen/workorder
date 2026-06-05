import type { DevStyleDto, Product } from '../types';
import { devStyleToProductForBom } from './devStyleToProduct';

/** 开发款式 → 与产品档案一致的编辑形状（sku = 款号/产品编号） */
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

/** 已发布大货时，用产品档案数据覆盖展示/编辑用的商品信息字段 */
export function resolveDevStyleWithPublishedProduct(
  style: DevStyleDto,
  products: Product[],
): DevStyleDto {
  if (!style.publishedProductId) return style;
  const published = products.find((p) => p.id === style.publishedProductId);
  if (!published) return style;
  return patchDevStyleFromProduct(style, published);
}
