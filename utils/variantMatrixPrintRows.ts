import type { AppDictionaries, PrintListRow, Product } from '../types';
import { buildMatrixJsonAndTotalQtyFromVariantLine } from './buildSalesBillPrintContext';
import { COLOR_SIZE_MATRIX_JSON_KEY } from './colorSizeMatrixPrint';

const EMPTY_DICT: AppDictionaries = { colors: [], sizes: [], units: [] };

export type VariantQtyInputRow = { variantId?: string | null; quantity: number };

/**
 * 同一成品下多行规格数量 → 单行 `PrintListRow`（含 `colorSizeMatrixJson`），用于生产入库、报工批次等。
 */
export function buildOneBlockMatrixPrintRows(opts: {
  productId: string;
  product: Product | undefined;
  products: Product[];
  dictionaries?: AppDictionaries;
  rows: VariantQtyInputRow[];
  /** 与矩阵列并排的其它占位字段（勿传 quantity 以免覆盖聚合结果） */
  extra?: PrintListRow;
}): PrintListRow[] {
  const { productId, product, products, dictionaries, rows, extra } = opts;
  const productMap = new Map(products.map(p => [p.id, p] as const));
  const dict = dictionaries ?? EMPTY_DICT;
  const variantQuantities: Record<string, number> = {};
  for (const r of rows) {
    const vid = r.variantId?.trim();
    if (!vid) continue;
    variantQuantities[vid] = (variantQuantities[vid] ?? 0) + (Number(r.quantity) || 0);
  }
  const qtySum = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const hasVar = Object.keys(variantQuantities).length > 0;
  const matrixSlice = product
    ? hasVar
      ? buildMatrixJsonAndTotalQtyFromVariantLine({
          productId,
          productMap,
          dictionaries: dict,
          variantQuantities,
        })
      : buildMatrixJsonAndTotalQtyFromVariantLine({
          productId,
          productMap,
          dictionaries: dict,
          quantity: qtySum,
        })
    : null;
  const qty = matrixSlice?.totalQty ?? qtySum;
  return [
    {
      index: 1,
      variantLabel: hasVar ? '' : '—',
      quantity: qty,
      sku: product?.sku ?? '',
      productName: product?.name ?? '',
      ...(extra ?? {}),
      ...(matrixSlice ? { [COLOR_SIZE_MATRIX_JSON_KEY]: matrixSlice.colorSizeMatrixJson } : {}),
    },
  ];
}
