import type { BOM, BOMItem, MaterialBreakdownRow, Product } from '../types';
import { distributeWeightByQty } from './reportBatchWeightHelpers';

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

/**
 * 多规格报工/收货的预估物料消耗：与提交口径完全一致——
 * 先按各规格良品数量把总重分摊为 per-variant 重量（`distributeWeightByQty`，与提交时逐条落库相同），
 * 再对每个规格用它自己的 BOM 跑 `calcUsageByWeight`，最后按子物料合并。
 *
 * 解决「各规格 BOM 物料不同（如三个颜色各配一种纱线）时，预估只显示第一个规格的 1 个物料」的问题。
 *
 * - `parts` 为各规格（数量 > 0）的 BOM + 数量；`totalWeightKg` 为本次交货总重量。
 * - 合并后 `ratio` = 该物料 actualWeight / 总实际分摊重量（仅展示用）。
 * - 某规格找不到 BOM 时该份重量不产生行（与后端"仅保存重量、不拆分"一致）。
 */
export function calcUsageByWeightMultiVariant(
  parts: Array<{ bom: Pick<BOM, 'items'> | null | undefined; quantity: number }>,
  totalWeightKg: number,
  productsById: Map<string, Pick<Product, 'id' | 'name'>>,
): MaterialBreakdownRow[] {
  const valid = parts.filter(p => numberize(p.quantity) > 0);
  if (valid.length === 0 || !(totalWeightKg > 0)) return [];

  const weights = distributeWeightByQty(
    totalWeightKg,
    valid.map(p => ({ quantity: numberize(p.quantity) })),
  );

  const merged = new Map<string, MaterialBreakdownRow>();
  valid.forEach((p, idx) => {
    const rows = calcUsageByWeight(p.bom, numberize(p.quantity), weights[idx] ?? 0, productsById);
    for (const row of rows) {
      const cur = merged.get(row.materialProductId);
      if (!cur) {
        merged.set(row.materialProductId, { ...row });
        continue;
      }
      cur.actualWeight += row.actualWeight;
      if (row.theoreticalQty != null) {
        cur.theoreticalQty = (cur.theoreticalQty ?? 0) + row.theoreticalQty;
      }
    }
  });

  const rows = Array.from(merged.values());
  const totalActual = rows.reduce((s, r) => s + r.actualWeight, 0);
  if (totalActual > 0) {
    for (const r of rows) r.ratio = r.actualWeight / totalActual;
  }
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
