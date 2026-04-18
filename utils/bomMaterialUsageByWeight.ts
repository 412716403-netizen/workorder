import type { BOM, BOMItem, MaterialBreakdownRow, Product } from '../types';

/**
 * 按报工/外协收货交货重量 + BOM 子项用量，自动派生各子物料占比，
 * 拆成各子物料的实际消耗重量（kg），用于写入 `ProductionOpRecord.materialBreakdown`。
 *
 * 口径：
 * - 参与分摊的子项 = `productId` 非空 且 `quantity > 0` 且 `excludeFromWeightShare !== true` 的行
 * - 占比 = 该行 quantity / 参与分摊子项的 quantity 之和
 * - actualWeight = weightKg × 占比
 * - 辅料（勾 `excludeFromWeightShare` 的，如标签 / 纽扣 / 洗水唛）不出现在结果里，由调用方按"件数 × quantity"另行累加
 *
 * 如果 weightKg <= 0 或没有任何参与分摊的子项，返回空数组（调用方应回退旧口径）。
 */
export function calcUsageByWeight(
  bom: Pick<BOM, 'items'> | null | undefined,
  quantity: number,
  weightKg: number,
  productsById: Map<string, Pick<Product, 'id' | 'name'>>,
): MaterialBreakdownRow[] {
  if (!bom || !Array.isArray(bom.items) || bom.items.length === 0) return [];
  if (!(weightKg > 0)) return [];

  const candidates = bom.items.filter((it: BOMItem) => {
    if (!it.productId || !String(it.productId).trim()) return false;
    if (it.excludeFromWeightShare) return false;
    const q = numberize(it.quantity);
    return q > 0;
  });
  if (candidates.length === 0) return [];

  const total = candidates.reduce((acc, it) => acc + numberize(it.quantity), 0);
  if (!(total > 0)) return [];

  const rows: MaterialBreakdownRow[] = candidates.map(it => {
    const q = numberize(it.quantity);
    const ratio = q / total;
    const actualWeight = weightKg * ratio;
    const prod = productsById.get(it.productId);
    const row: MaterialBreakdownRow = {
      materialProductId: it.productId,
      materialName: prod?.name ?? '',
      ratio,
      actualWeight,
    };
    if (Number.isFinite(quantity) && quantity > 0) {
      row.theoreticalQty = q * quantity;
    }
    return row;
  });

  return rows;
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
