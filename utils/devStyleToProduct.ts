import type { DevBomDto, DevStyleDto } from '../types';
import type { BOM, Product } from '../types';

/** 将开发款式映射为 Product 形状，供 BomEditorPortal / 工序选择等复用 */
export function devStyleToProductForBom(style: DevStyleDto): Product {
  return {
    id: style.id,
    sku: style.code,
    name: style.name,
    imageUrl: style.imageUrl,
    categoryId: style.categoryId,
    salesPrice: style.salesPrice,
    purchasePrice: style.purchasePrice,
    unitId: style.unitId,
    supplierId: style.supplierId,
    colorIds: style.colorIds ?? [],
    sizeIds: style.sizeIds ?? [],
    variants: (style.variants ?? []).map((v) => ({
      id: v.id,
      colorId: v.colorId ?? '',
      sizeId: v.sizeId ?? '',
      skuSuffix: v.skuSuffix ?? '',
      nodeBoms: v.nodeBoms ?? {},
    })),
    categoryCustomData: style.categoryCustomData ?? {},
    milestoneNodeIds: style.milestoneNodeIds ?? [],
    routeReportValues: {},
    routeReportDisplayValues: {},
  };
}

export function devBomsToProductBoms(rows: DevBomDto[]): BOM[] {
  return rows.map((b) => ({
    id: b.id,
    parentProductId: b.parentStyleId,
    variantId: b.variantId,
    nodeId: b.nodeId,
    name: b.name,
    items: (b.items ?? []).map((it) => ({
      id: it.id,
      categoryId: it.categoryId,
      productId: it.productId,
      quantity: it.quantity,
      note: it.note,
      useShortageOnly: it.useShortageOnly,
      excludeFromWeightShare: it.excludeFromWeightShare,
      sortOrder: it.sortOrder,
    })),
  }));
}
