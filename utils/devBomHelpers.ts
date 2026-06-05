import type { BOM, DevBomDto } from '../types';
import { bomHasConfiguredItems } from './bomEffective';

/** 开发款式单 SKU 在 UI 中使用的虚拟变体 id */
export function devSingleSkuVariantId(styleId: string): string {
  return `dvar-single-${styleId}`;
}

/** 单 SKU 开发 BOM 在库中 variantId 为空（与产品档案无变体一致） */
export function isDevSingleSkuBom(bom: { variantId?: string | null }, styleId: string): boolean {
  if (!bom.variantId) return true;
  return bom.variantId === devSingleSkuVariantId(styleId);
}

export function buildDevSingleSkuNodeBOMs(
  boms: BOM[],
  parentStyleId: string,
): Record<string, string> {
  return Object.fromEntries(
    boms
      .filter(
        (b) =>
          b.parentProductId === parentStyleId &&
          isDevSingleSkuBom(b, parentStyleId) &&
          b.nodeId &&
          bomHasConfiguredItems(b),
      )
      .map((b) => [b.nodeId!, b.id]),
  );
}

export function workingBomToDevBom(
  wb: BOM,
  parentStyleId: string,
  singleSkuVariantId: string,
): DevBomDto {
  const isSingleSku =
    wb.variantId === singleSkuVariantId || wb.variantId === undefined || wb.variantId === '';
  return {
    id: wb.id,
    parentStyleId,
    variantId: isSingleSku ? undefined : wb.variantId,
    nodeId: wb.nodeId,
    name: wb.name,
    items: wb.items.map((it) => ({
      id: it.id,
      categoryId: it.categoryId,
      productId: it.productId,
      quantity: Number(it.quantity),
      note: it.note,
      useShortageOnly: it.useShortageOnly,
      excludeFromWeightShare: it.excludeFromWeightShare,
      sortOrder: it.sortOrder,
    })),
  };
}
