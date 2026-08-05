import type { AppDictionaries, Product } from '../types';

export interface VariantQtySource {
  variantId?: string | null;
  quantity?: number | null;
}

export interface CollabColorSizeQtySource {
  colorName?: string | null;
  sizeName?: string | null;
  quantity?: number | null;
}

export interface VariantQtyBreakdown {
  quantities: Record<string, number>;
  unassignedQty: number;
  totalQty: number;
}

export function aggregateVariantQty(
  records: readonly VariantQtySource[],
): VariantQtyBreakdown {
  const quantities: Record<string, number> = {};
  let unassignedQty = 0;
  let totalQty = 0;

  for (const record of records) {
    const quantity = Number(record.quantity) || 0;
    const variantId = record.variantId?.trim();
    totalQty += quantity;
    if (!variantId) {
      unassignedQty += quantity;
      continue;
    }
    quantities[variantId] = (quantities[variantId] ?? 0) + quantity;
  }

  return { quantities, unassignedQty, totalQty };
}

/** 将 Record<variantId, qty> 转为悬浮矩阵用的 breakdown（空键计入未记录规格） */
export function breakdownFromVariantQtyMap(
  map: Record<string, number> | null | undefined,
): VariantQtyBreakdown {
  return aggregateVariantQty(
    Object.entries(map ?? {}).map(([variantId, quantity]) => ({
      variantId: variantId.trim() ? variantId : null,
      quantity,
    })),
  );
}

/** @deprecated 使用 aggregateVariantQty */
export const aggregateOutsourceVariantQty = aggregateVariantQty;

export function subtractVariantQty(
  left: VariantQtyBreakdown,
  right: VariantQtyBreakdown,
): VariantQtyBreakdown {
  const quantities: Record<string, number> = {};
  const variantIds = new Set([
    ...Object.keys(left.quantities),
    ...Object.keys(right.quantities),
  ]);

  for (const variantId of variantIds) {
    const quantity = (left.quantities[variantId] ?? 0) - (right.quantities[variantId] ?? 0);
    if (quantity !== 0) quantities[variantId] = quantity;
  }

  return {
    quantities,
    unassignedQty: left.unassignedQty - right.unassignedQty,
    totalQty: left.totalQty - right.totalQty,
  };
}

/** @deprecated 使用 subtractVariantQty */
export const subtractOutsourceVariantQty = subtractVariantQty;

export function getSingleFlowProductId(
  rows: readonly { productId?: string | null }[],
): string | null {
  const productIds = new Set(
    rows.map(row => row.productId?.trim()).filter((id): id is string => Boolean(id)),
  );
  return productIds.size === 1 ? [...productIds][0]! : null;
}

function normalizeSpecName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** 协作 payload 的色名×码名明细映射到本地产品 variantId 后再聚合 */
export function aggregateCollabColorSizeQty(
  items: readonly CollabColorSizeQtySource[],
  product: Product | null | undefined,
  dictionaries: AppDictionaries | null | undefined,
): VariantQtyBreakdown {
  if (!product?.variants?.length || !dictionaries) {
    return aggregateVariantQty(
      items.map(item => ({ quantity: item.quantity, variantId: null })),
    );
  }

  const colorIdByName = new Map(
    dictionaries.colors.map(color => [normalizeSpecName(color.name), color.id]),
  );
  const sizeIdByName = new Map(
    dictionaries.sizes.map(size => [normalizeSpecName(size.name), size.id]),
  );
  const variantIdBySpec = new Map(
    product.variants.map(variant => [
      `${variant.colorId ?? ''}|${variant.sizeId ?? ''}`,
      variant.id,
    ]),
  );

  return aggregateVariantQty(
    items.map(item => {
      const colorId = colorIdByName.get(normalizeSpecName(item.colorName));
      const sizeId = sizeIdByName.get(normalizeSpecName(item.sizeName));
      const variantId =
        colorId && sizeId ? variantIdBySpec.get(`${colorId}|${sizeId}`) : undefined;
      return { quantity: item.quantity, variantId: variantId ?? null };
    }),
  );
}

export function resolveProductUnitName(
  product: Product | null | undefined,
  dictionaries: AppDictionaries | null | undefined,
  fallback = '件',
): string {
  const unitId = product?.unitId;
  if (!unitId || !dictionaries?.units?.length) return fallback;
  return dictionaries.units.find(unit => unit.id === unitId)?.name || fallback;
}
