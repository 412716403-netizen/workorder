import { describe, it, expect } from 'vitest';
import { getMaterialLossRates, applyLoss, MATERIAL_LOSS_RATES_KEY } from './materialLoss';

describe('getMaterialLossRates', () => {
  it('returns empty object for missing/invalid customData', () => {
    expect(getMaterialLossRates(undefined)).toEqual({});
    expect(getMaterialLossRates(null)).toEqual({});
    expect(getMaterialLossRates({})).toEqual({});
    expect(getMaterialLossRates({ [MATERIAL_LOSS_RATES_KEY]: 'x' })).toEqual({});
    expect(getMaterialLossRates({ [MATERIAL_LOSS_RATES_KEY]: [1, 2] })).toEqual({});
  });

  it('reads valid positive numbers and filters out the rest', () => {
    expect(
      getMaterialLossRates({
        [MATERIAL_LOSS_RATES_KEY]: { a: 5, b: '10', c: 0, d: -3, e: 'abc', f: 2.5 },
      }),
    ).toEqual({ a: 5, b: 10, f: 2.5 });
  });
});

describe('applyLoss', () => {
  it('returns base unchanged when no/zero/negative loss', () => {
    expect(applyLoss(100, undefined)).toBe(100);
    expect(applyLoss(100, 0)).toBe(100);
    expect(applyLoss(100, -5)).toBe(100);
    expect(applyLoss(100, NaN)).toBe(100);
  });

  it('scales base by (1 + loss%)', () => {
    expect(applyLoss(100, 5)).toBeCloseTo(105, 5);
    expect(applyLoss(200, 10)).toBeCloseTo(220, 5);
    expect(applyLoss(50, 2.5)).toBeCloseTo(51.25, 5);
  });

  it('returns 0 for invalid base', () => {
    expect(applyLoss(NaN, 5)).toBe(0);
  });
});
