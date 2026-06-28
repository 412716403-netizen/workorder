/**
 * 报工物料耗材数量 / 成本口径，与生产物料面板 StockMaterialPanel 对齐。
 * - 未开启称重：报工良品数 × BOM 子项用量（theoryCost 路径）
 * - 开启称重且有 materialBreakdown：各子物料 actualWeight 累加（actualCost 路径，与 applyMaterialBreakdown 一致）
 */

export type MaterialBreakdownRowIn = {
  materialProductId?: string;
  theoreticalQty?: number;
  actualWeight?: number;
};

export type BomItemQty = { productId: string; quantity: number };

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 采购单位为重量类（kg/g）时，称重快照用 actualWeight；否则用 theoreticalQty */
export function isWeightPurchaseUnit(unitName: string): boolean {
  const n = unitName.trim().toLowerCase();
  return (
    n === 'kg'
    || n === '千克'
    || n === '公斤'
    || n === 'kilogram'
    || n === 'g'
    || n === '克'
    || n === 'gram'
  );
}

export function unitNameForMaterial(
  materialProductId: string,
  unitNameByMaterialId: Map<string, string>,
): string {
  return unitNameByMaterialId.get(materialProductId) ?? '';
}

/** 单条 breakdown 行 → 耗材数量（与面板 applyMaterialBreakdown / actualCost 一致，仅 actualWeight） */
export function consumableQtyFromBreakdownRow(
  row: MaterialBreakdownRowIn,
  _unitNameByMaterialId?: Map<string, string>,
): number {
  const aw = num(row.actualWeight);
  return aw > 0 ? aw : 0;
}

/** 称重快照各子物料耗材数量之和（matRowReportCost 的 actual 路径） */
export function sumBreakdownConsumableQty(
  breakdown: MaterialBreakdownRowIn[],
  unitNameByMaterialId: Map<string, string>,
): number {
  return breakdown.reduce(
    (sum, row) => sum + consumableQtyFromBreakdownRow(row, unitNameByMaterialId),
    0,
  );
}

/** breakdown × 物料单价（数量口径同面板） */
export function materialCostFromBreakdownRows(
  breakdown: MaterialBreakdownRowIn[],
  priceMap: Map<string, number>,
  unitNameByMaterialId: Map<string, string>,
): number {
  return breakdown.reduce((sum, row) => {
    const pid = row.materialProductId;
    if (!pid) return sum;
    const qty = consumableQtyFromBreakdownRow(row, unitNameByMaterialId);
    if (!(qty > 0)) return sum;
    return sum + qty * (priceMap.get(pid) ?? 0);
  }, 0);
}

/** BOM × 报工数（耗材数量，不含单价） */
export function consumableQtyFromBomItems(bomItems: BomItemQty[], goodQty: number): number {
  if (!(goodQty > 0) || bomItems.length === 0) return 0;
  return bomItems.reduce((sum, item) => sum + goodQty * num(item.quantity), 0);
}

/**
 * 单次报工的物料耗材数量（口径与 computeReportMaterialCost 一致，不含金额）。
 */
export function computeReportMaterialConsumableQty(params: {
  weightEnabled: boolean;
  breakdown: MaterialBreakdownRowIn[];
  goodQty: number;
  bomItems: BomItemQty[];
}): number {
  const { weightEnabled, breakdown, goodQty, bomItems } = params;
  if (shouldUseMaterialBreakdownForCost(weightEnabled, breakdown)) {
    return sumBreakdownConsumableQty(breakdown, new Map());
  }
  return consumableQtyFromBomItems(bomItems, goodQty);
}

/** BOM × 报工数 × 单价 */
export function materialCostFromBomItems(
  bomItems: BomItemQty[],
  goodQty: number,
  priceMap: Map<string, number>,
): number {
  if (!(goodQty > 0) || bomItems.length === 0) return 0;
  return bomItems.reduce(
    (sum, item) => sum + goodQty * num(item.quantity) * (priceMap.get(item.productId) ?? 0),
    0,
  );
}

/** 是否与面板 applyMaterialBreakdown 一致：工序当前开启称重且快照非空 */
export function shouldUseMaterialBreakdownForCost(
  weightEnabled: boolean,
  breakdown: MaterialBreakdownRowIn[],
): boolean {
  return weightEnabled && breakdown.length > 0;
}

/**
 * 单次报工的物料成本金额（耗材数量口径与面板一致，再 × 采购加权均价）。
 */
export function computeReportMaterialCost(params: {
  weightEnabled: boolean;
  breakdown: MaterialBreakdownRowIn[];
  goodQty: number;
  bomItems: BomItemQty[];
  priceMap: Map<string, number>;
  unitNameByMaterialId: Map<string, string>;
}): number {
  const { weightEnabled, breakdown, goodQty, bomItems, priceMap, unitNameByMaterialId } = params;
  if (shouldUseMaterialBreakdownForCost(weightEnabled, breakdown)) {
    return materialCostFromBreakdownRows(breakdown, priceMap, unitNameByMaterialId);
  }
  return materialCostFromBomItems(bomItems, goodQty, priceMap);
}
