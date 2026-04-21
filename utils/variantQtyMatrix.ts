import type { AppDictionaries, Product, ProductVariant } from '../types';
import { sortedVariantColorEntries } from './sortVariantsByProduct';

export type VariantQtyMatrixColumn = { id: string; header: string };

export type VariantQtyMatrixColorRow = {
  key: string;
  colorLabel: string;
  colorSwatch?: string;
  /** 与 sizeColumns 下标对齐；无该颜色×尺码组合时为 null */
  variantAtSize: (ProductVariant | null)[];
};

/**
 * 将产品规格展开为「颜色 × 尺码」矩阵行（用于统一表格布局）。
 * 有完整 colorIds+sizeIds 时按产品维度建格；否则按已存在变体推导尺码列并排序。
 */
export function buildVariantQtyMatrixLayout(
  product: Product,
  dict: AppDictionaries,
): { sizeColumns: VariantQtyMatrixColumn[]; colorRows: VariantQtyMatrixColorRow[] } | null {
  const variants = product.variants;
  if (!variants?.length) return null;

  const fullGrid =
    Boolean(product.colorIds?.length && product.sizeIds?.length && dict.colors?.length && dict.sizes?.length);

  if (fullGrid) {
    const colorRows: VariantQtyMatrixColorRow[] = [];
    for (const colorId of product.colorIds!) {
      const color = dict.colors!.find(c => c.id === colorId);
      if (!color) continue;
      const variantAtSize = product.sizeIds!.map(sizeId =>
        variants.find(v => v.colorId === colorId && v.sizeId === sizeId) ?? null,
      );
      colorRows.push({
        key: colorId,
        colorLabel: color.name,
        colorSwatch: color.value,
        variantAtSize,
      });
    }
    const sizeColumns = product.sizeIds!.map(sizeId => {
      const s = dict.sizes!.find(x => x.id === sizeId);
      const name = s?.name != null && String(s.name).trim() !== '' ? String(s.name).trim() : sizeId;
      return { id: sizeId, header: name };
    });
    return { sizeColumns, colorRows };
  }

  const groupedByColor: Record<string, ProductVariant[]> = {};
  for (const v of variants) {
    const cid = v.colorId || '_';
    if (!groupedByColor[cid]) groupedByColor[cid] = [];
    groupedByColor[cid].push(v);
  }
  const entries = sortedVariantColorEntries(groupedByColor, product.colorIds, product.sizeIds);

  const allSizeIds = new Set<string>();
  for (const v of variants) {
    if (v.sizeId) allSizeIds.add(v.sizeId);
  }
  let sizeIdsOrdered = [...allSizeIds];
  if (product.sizeIds?.length) {
    const order = new Map(product.sizeIds.map((id, i) => [id, i]));
    sizeIdsOrdered.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  } else {
    sizeIdsOrdered.sort((a, b) => {
      const na = dict.sizes.find(s => s.id === a)?.name ?? a;
      const nb = dict.sizes.find(s => s.id === b)?.name ?? b;
      return na.localeCompare(nb, 'zh-CN');
    });
  }

  const sizeColumns = sizeIdsOrdered.map(sizeId => {
    const s = dict.sizes.find(x => x.id === sizeId);
    const name = s?.name != null && String(s.name).trim() !== '' ? String(s.name).trim() : sizeId;
    return { id: sizeId, header: name };
  });

  const colorRows: VariantQtyMatrixColorRow[] = entries.map(([colorId, colorVariants]) => {
    const color = colorId !== '_' ? dict.colors.find(c => c.id === colorId) : undefined;
    const colorLabel = color ? color.name : colorId === '_' ? '规格' : colorId;
    const colorSwatch = color?.value;
    const variantAtSize = sizeIdsOrdered.map(sid => colorVariants.find(v => v.sizeId === sid) ?? null);
    return { key: String(colorId), colorLabel, colorSwatch, variantAtSize };
  });

  return { sizeColumns, colorRows };
}

/** 与计划文档命名一致，等价于 `buildVariantQtyMatrixLayout` */
export const buildVariantQtyMatrixModel = buildVariantQtyMatrixLayout;
