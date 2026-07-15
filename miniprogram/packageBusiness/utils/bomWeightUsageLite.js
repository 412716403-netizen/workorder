/**
 * 称重报工/外协收货：按 BOM 占比把「本次交货总重量」拆成各子物料实际消耗（预估）。
 * 对齐 Web `utils/bomMaterialUsageByWeight.ts` + `utils/reportBatchWeightHelpers.ts`：
 * - 参与分摊子项 = productId 非空 且 quantity > 0 且 excludeFromWeightShare !== true
 * - 多规格时先按良品数量分摊总重（末行吸收舍入误差），再逐规格用各自 BOM 拆分后合并，
 *   与后端逐条落库（per-variant BOM）口径一致。
 */

const WEIGHT_KG_SCALE = 10000; // Decimal(12,4)

function roundWeightKg(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * WEIGHT_KG_SCALE) / WEIGHT_KG_SCALE;
}

function numberize(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** 按良品数量比例分摊总重到各行；末行吸收舍入误差，保证 Σ = batchW（对齐 Web distributeWeightByQty） */
function distributeWeightByQty(batchW, rows) {
  const totalW = roundWeightKg(batchW);
  const goodSum = (rows || []).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  if (!rows || rows.length === 0) return [];
  if (goodSum <= 0) return rows.map(() => 0);
  if (rows.length === 1) return [totalW];
  let allocated = 0;
  return rows.map((row, idx) => {
    if (idx === rows.length - 1) return roundWeightKg(totalW - allocated);
    const part = roundWeightKg((totalW * (Number(row.quantity) || 0)) / goodSum);
    allocated += part;
    return part;
  });
}

/**
 * 单 BOM 按占比拆分（对齐 Web calcUsageByWeight）。
 * @param {{items: Array}} bom
 * @param {number} quantity 报工/收货件数（用于理论件数）
 * @param {number} weightKg 本次交货总重量
 * @param {(pid: string) => string} nameOf 子物料名称解析
 */
function calcUsageByWeight(bom, quantity, weightKg, nameOf) {
  if (!bom || !Array.isArray(bom.items) || bom.items.length === 0) return [];
  if (!(weightKg > 0)) return [];

  const candidates = bom.items.filter((it) => {
    if (!it.productId || !String(it.productId).trim()) return false;
    if (it.excludeFromWeightShare) return false;
    return numberize(it.quantity) > 0;
  });
  if (candidates.length === 0) return [];

  const total = candidates.reduce((acc, it) => acc + numberize(it.quantity), 0);
  if (!(total > 0)) return [];

  return candidates.map((it) => {
    const q = numberize(it.quantity);
    const ratio = q / total;
    const row = {
      materialProductId: it.productId,
      materialName: (nameOf && nameOf(it.productId)) || '',
      ratio,
      actualWeight: weightKg * ratio,
    };
    if (Number.isFinite(quantity) && quantity > 0) {
      row.theoreticalQty = q * quantity;
    }
    return row;
  });
}

/**
 * 多规格合并预估（对齐 Web calcUsageByWeightMultiVariant）：
 * parts = [{ bom, quantity }]（仅良品数量 > 0 的规格），totalWeightKg 为本次交货总重量。
 */
function calcUsageByWeightMultiVariant(parts, totalWeightKg, nameOf) {
  const valid = (parts || []).filter((p) => numberize(p.quantity) > 0);
  if (valid.length === 0 || !(totalWeightKg > 0)) return [];

  const weights = distributeWeightByQty(
    totalWeightKg,
    valid.map((p) => ({ quantity: numberize(p.quantity) })),
  );

  const merged = new Map();
  valid.forEach((p, idx) => {
    const rows = calcUsageByWeight(p.bom, numberize(p.quantity), weights[idx] || 0, nameOf);
    rows.forEach((row) => {
      const cur = merged.get(row.materialProductId);
      if (!cur) {
        merged.set(row.materialProductId, { ...row });
        return;
      }
      cur.actualWeight += row.actualWeight;
      if (row.theoreticalQty != null) {
        cur.theoreticalQty = (cur.theoreticalQty || 0) + row.theoreticalQty;
      }
    });
  });

  const rows = Array.from(merged.values());
  const totalActual = rows.reduce((s, r) => s + r.actualWeight, 0);
  if (totalActual > 0) {
    rows.forEach((r) => {
      r.ratio = r.actualWeight / totalActual;
    });
  }
  return rows;
}

/** 按节点 + 产品（可选 variant）定位适用 BOM；优先精确 variant，次选无 variant，再兜底第一条（对齐 Web resolveBomForProductVariant） */
function resolveBomForVariant(boms, productId, nodeId, variantId) {
  const forProduct = (boms || []).filter(
    (b) => b && b.parentProductId === productId && b.nodeId === nodeId,
  );
  if (forProduct.length === 0) return undefined;
  if (variantId) {
    const exact = forProduct.find((b) => b.variantId === variantId);
    if (exact) return exact;
  }
  return forProduct.find((b) => !b.variantId) || forProduct[0];
}

/** 预估行 → WXML 展示行（占比 %、理论/实际 4 位小数，与 Web 表格一致） */
function buildWeightPreviewViewRows(rows) {
  return (rows || []).map((r) => ({
    materialProductId: r.materialProductId,
    name: r.materialName || r.materialProductId,
    ratioText: `${(r.ratio * 100).toFixed(1)}%`,
    theoryText: r.theoreticalQty != null ? r.theoreticalQty.toFixed(4) : '—',
    actualText: r.actualWeight.toFixed(4),
  }));
}

module.exports = {
  roundWeightKg,
  distributeWeightByQty,
  calcUsageByWeight,
  calcUsageByWeightMultiVariant,
  resolveBomForVariant,
  buildWeightPreviewViewRows,
};
