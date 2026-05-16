/**
 * 报工批次的重量字段相关纯函数 (Phase 3.5 抽离自 ReportBatchDetailModal.tsx)。
 *
 * - 报工的 weight 字段在历史上既可能是 number 也可能是 string
 * - 编辑表单需要把 weight 反序列化成可编辑值 (空 / 非负数)
 * - 批次编辑 / 外协收回 / 矩阵报工时一行总重 → 按数量比例分摊到 N 行（末行吸收误差）
 * - 精度与 DB `Decimal(12,4)` 对齐
 */

/** 与 Prisma `Decimal(12,4)` 一致 */
export const WEIGHT_KG_DECIMALS = 4;
const WEIGHT_KG_SCALE = 10 ** WEIGHT_KG_DECIMALS;

export function roundWeightKg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * WEIGHT_KG_SCALE) / WEIGHT_KG_SCALE;
}

/**
 * 把可能是 number/string/null/undefined 的 weight 字段转成「可累加部分」。
 * - 非有限值 / 0 / 负数 → 0 (合计时跳过)
 * - 其他 → 原值
 */
export function weightToNumberSumPart(w: unknown): number {
  const n = typeof w === 'number' ? w : typeof w === 'string' ? parseFloat(String(w)) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 把 weight 字段反序列化为可编辑值。
 * - 非有限 / 负数 → '' (空字符串，让 input 显示为空)
 * - 其他 → number
 */
export function parseWeightFieldForEdit(w: unknown): number | '' {
  const n = typeof w === 'number' ? w : typeof w === 'string' ? parseFloat(String(w)) : NaN;
  if (!Number.isFinite(n) || n < 0) return '';
  return n;
}

/**
 * 按良品数量比例分摊批次总重到各行；最后一行吸收四舍五入误差，保证 Σ = batchW。
 * - 行数为 0 → []
 * - 良品总数为 0 → 全 0
 * - 内部精度按 WEIGHT_KG_SCALE（4 位小数）保留；末行吸收舍入误差，保证 Σ === batchW
 */
export function distributeWeightByQty(
  batchW: number,
  rows: ReadonlyArray<{ quantity: number }>,
): number[] {
  const totalW = roundWeightKg(batchW);
  const goodSum = rows.reduce((s, r) => s + r.quantity, 0);
  if (rows.length === 0) return [];
  if (goodSum <= 0) return rows.map(() => 0);
  if (rows.length === 1) return [totalW];
  let allocated = 0;
  return rows.map((row, idx) => {
    if (idx === rows.length - 1) return roundWeightKg(totalW - allocated);
    const part = roundWeightKg((totalW * row.quantity) / goodSum);
    allocated += part;
    return part;
  });
}

/** @deprecated 别名，请优先使用 distributeWeightByQty */
export const distributeReportWeightsByGoodQty = distributeWeightByQty;

/** 展示用：去掉无意义的尾零，避免 10.9998 这类浮点噪声 */
export function formatWeightKgDisplay(w: unknown): string {
  const n = typeof w === 'number' ? w : typeof w === 'string' ? parseFloat(String(w)) : NaN;
  if (!Number.isFinite(n) || n <= 0) return '—';
  const rounded = roundWeightKg(n);
  if (Number.isInteger(rounded)) return String(Math.trunc(rounded));
  const t = rounded.toFixed(WEIGHT_KG_DECIMALS).replace(/\.?0+$/, '');
  return t || '0';
}

export type WeightKeyedEntry = {
  entryKey: string;
  baseKey: string;
  nodeId: string;
  quantity: number;
};

/**
 * 外协收回 / 矩阵报工：按 baseKey（工单|工序 或 产品|工序）分组，把行总重分摊到各 entryKey。
 * 返回 Map<entryKey, weightKg>；未启用称重或无总重时不写入。
 */
export function buildWeightMapForKeyedEntries(
  entries: ReadonlyArray<WeightKeyedEntry>,
  lineWeights: Record<string, number>,
  nodeUsesWeight: (nodeId: string) => boolean,
): Map<string, number> {
  const result = new Map<string, number>();
  const byBase = new Map<string, WeightKeyedEntry[]>();
  for (const e of entries) {
    if (!(e.quantity > 0)) continue;
    const arr = byBase.get(e.baseKey) ?? [];
    arr.push(e);
    byBase.set(e.baseKey, arr);
  }
  for (const [baseKey, items] of byBase) {
    const nodeId = items[0]?.nodeId ?? '';
    if (!nodeUsesWeight(nodeId)) continue;
    const lineTotalW = roundWeightKg(Number(lineWeights[baseKey]) || 0);
    if (!(lineTotalW > 0)) continue;
    const parts = distributeWeightByQty(
      lineTotalW,
      items.map(it => ({ quantity: it.quantity })),
    );
    items.forEach((it, idx) => {
      const w = parts[idx];
      if (w > 0) result.set(it.entryKey, w);
    });
  }
  return result;
}
