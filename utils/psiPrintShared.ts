import type { Product } from '../types';

export interface PsiLineBase {
  id: string;
  productId: string;
  quantity?: number;
  variantQuantities?: Record<string, number>;
}

export function sumPsiLineQty<T extends PsiLineBase>(
  lines: T[],
  productMap: Map<string, Product>,
): number {
  let total = 0;
  for (const line of lines) {
    const prod = productMap.get(line.productId);
    const hasVar = prod?.variants?.length && line.variantQuantities && Object.keys(line.variantQuantities).length > 0;
    if (hasVar) {
      for (const q of Object.values(line.variantQuantities ?? {})) {
        total += Number(q) || 0;
      }
    } else {
      total += Number(line.quantity) || 0;
    }
  }
  return total;
}

export function sumPsiLineAmount<T extends PsiLineBase>(
  lines: T[],
  productMap: Map<string, Product>,
  priceGetter: (line: T) => number,
): number {
  let total = 0;
  for (const line of lines) {
    const price = priceGetter(line);
    const prod = productMap.get(line.productId);
    const hasVar = prod?.variants?.length && line.variantQuantities && Object.keys(line.variantQuantities).length > 0;
    if (hasVar) {
      for (const [, q] of Object.entries(line.variantQuantities ?? {})) {
        total += (Number(q) || 0) * price;
      }
    } else {
      total += (Number(line.quantity) || 0) * price;
    }
  }
  return total;
}

/** PSI 打印聚合用的最小行字段（与 `PsiRecord` 子集一致） */
export interface PsiDocLineRecord {
  id: string;
  productId: string;
  lineGroupId?: string | null;
  variantId?: string | null;
  quantity?: number | string | null;
  purchasePrice?: number | string | null;
  salesPrice?: number | string | null;
  batchNo?: string | null;
  /** @deprecated API 历史字段，优先用 batchNo */
  batch?: string | null;
}

/**
 * 将同一单号下的 PSI 行记录聚合为打印行输入。
 * 多规格行聚合到 variantQuantities，非规格行汇总 quantity。
 */
export function groupPsiDocLines<TOut extends PsiLineBase>(
  docItems: PsiDocLineRecord[],
  buildLine: (
    lgId: string,
    first: PsiDocLineRecord,
    recs: PsiDocLineRecord[],
    hasVar: boolean,
    vq: Record<string, number>,
    lineQtyNoVar: number,
  ) => TOut,
): TOut[] {
  const lineMap: Record<string, PsiDocLineRecord[]> = {};
  docItems.forEach((r) => {
    const lg = r.lineGroupId ?? r.id;
    if (!lineMap[lg]) lineMap[lg] = [];
    lineMap[lg].push(r);
  });
  return Object.entries(lineMap).map(([lgId, recs]) => {
    const first = recs[0];
    const hasVar = recs.some((row) => row.variantId);
    const vq: Record<string, number> = {};
    if (hasVar) {
      recs.forEach((row) => {
        if (row.variantId) vq[row.variantId] = (vq[row.variantId] ?? 0) + (Number(row.quantity) || 0);
      });
    }
    const lineQtyNoVar = recs.reduce((s, row) => s + (Number(row.quantity) || 0), 0);
    return buildLine(lgId, first, recs, hasVar, vq, lineQtyNoVar);
  });
}
