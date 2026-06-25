/**
 * 物料损耗计算纯函数（计划详情用料清单）。
 *
 * 损耗率按计划单持久化于 `PlanOrder.customData.materialLossRates`：
 * `Record<rowKey, number>`，rowKey = `materialId-nodeId-parentId`，值为百分比（如 5 表示 +5%）。
 * 理论总需量按 `base × (1 + 损耗% / 100)` 放大。
 */
export const MATERIAL_LOSS_RATES_KEY = 'materialLossRates' as const;

/** 从计划单 customData 安全读取损耗率表；过滤非有限数值，负值归零 */
export function getMaterialLossRates(
  customData: Record<string, unknown> | null | undefined,
): Record<string, number> {
  const raw = customData?.[MATERIAL_LOSS_RATES_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

/** 理论需量按损耗放大：base × (1 + lossPct/100)。lossPct 非法/负值视为 0 */
export function applyLoss(base: number, lossPct: number | undefined | null): number {
  const b = Number(base);
  if (!Number.isFinite(b)) return 0;
  const p = Number(lossPct);
  if (!Number.isFinite(p) || p <= 0) return b;
  return b * (1 + p / 100);
}
