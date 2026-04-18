/**
 * 后端版"按重量 + BOM 子项用量自动派生占比"的物料消耗拆分。
 * 与前端 `utils/bomMaterialUsageByWeight.ts` 口径完全一致，单独维护一份避免跨前后端 import。
 */
export interface BomItemInputWeight {
  productId: string;
  quantity: unknown;
  excludeFromWeightShare?: boolean;
}

export interface MaterialBreakdownRowOut {
  materialProductId: string;
  materialName: string;
  ratio: number;
  actualWeight: number;
  theoreticalQty?: number;
}

export function calcUsageByWeight(
  bomItems: BomItemInputWeight[] | null | undefined,
  quantity: number,
  weightKg: number,
  productNameById: (productId: string) => string,
): MaterialBreakdownRowOut[] {
  if (!Array.isArray(bomItems) || bomItems.length === 0) return [];
  if (!(weightKg > 0)) return [];

  const candidates = bomItems.filter(it => {
    if (!it.productId || !String(it.productId).trim()) return false;
    if (it.excludeFromWeightShare) return false;
    const q = numberize(it.quantity);
    return q > 0;
  });
  if (candidates.length === 0) return [];

  const total = candidates.reduce((acc, it) => acc + numberize(it.quantity), 0);
  if (!(total > 0)) return [];

  return candidates.map(it => {
    const q = numberize(it.quantity);
    const ratio = q / total;
    const actualWeight = weightKg * ratio;
    const row: MaterialBreakdownRowOut = {
      materialProductId: it.productId,
      materialName: productNameById(it.productId) || '',
      ratio,
      actualWeight,
    };
    if (Number.isFinite(quantity) && quantity > 0) {
      row.theoreticalQty = q * quantity;
    }
    return row;
  });
}

function numberize(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (v && typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    try {
      const n = (v as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}
