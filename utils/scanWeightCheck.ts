/**
 * 扫码称重校验：期望重量 = 单件标准重量 × 数量；偏差 = |实测 - 期望| / 期望。
 */

export function expectedWeightKg(unitWeightKg: number, quantity: number): number {
  if (!(unitWeightKg > 0) || !(quantity > 0)) return 0;
  return unitWeightKg * quantity;
}

export interface WeightToleranceCheckResult {
  ok: boolean;
  /** 期望总重(kg) */
  expectedKg: number;
  /** 实测总重(kg) */
  measuredKg: number;
  /** 相对期望的偏差百分比，如 5.2 表示 +5.2% */
  deviationPercent: number;
  /** 是否因缺少标准重量或实测而跳过校验 */
  skipped: boolean;
  skipReason?: 'no_unit_weight' | 'no_measured' | 'invalid_expected';
}

export function checkWeightTolerance(
  expectedKg: number,
  measuredKg: number,
  tolerancePercent: number,
): WeightToleranceCheckResult {
  if (!(expectedKg > 0)) {
    return {
      ok: true,
      expectedKg: 0,
      measuredKg,
      deviationPercent: 0,
      skipped: true,
      skipReason: 'invalid_expected',
    };
  }
  if (measuredKg == null || !Number.isFinite(measuredKg) || measuredKg <= 0) {
    return {
      ok: true,
      expectedKg,
      measuredKg: measuredKg ?? 0,
      deviationPercent: 0,
      skipped: true,
      skipReason: 'no_measured',
    };
  }
  const deviationPercent = ((measuredKg - expectedKg) / expectedKg) * 100;
  const absDev = Math.abs(deviationPercent);
  const tol = Math.max(0, tolerancePercent);
  return {
    ok: absDev <= tol,
    expectedKg,
    measuredKg,
    deviationPercent,
    skipped: false,
  };
}

export function formatWeightKg(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(3);
}

export function formatDeviationPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}
