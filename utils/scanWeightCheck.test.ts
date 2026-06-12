import { describe, expect, it } from 'vitest';
import { checkWeightTolerance, expectedWeightKg } from './scanWeightCheck';

describe('expectedWeightKg', () => {
  it('multiplies unit weight by quantity', () => {
    expect(expectedWeightKg(0.35, 10)).toBeCloseTo(3.5);
  });

  it('returns 0 for invalid inputs', () => {
    expect(expectedWeightKg(0, 10)).toBe(0);
    expect(expectedWeightKg(0.35, 0)).toBe(0);
  });
});

describe('checkWeightTolerance', () => {
  it('passes within tolerance', () => {
    const r = checkWeightTolerance(3.5, 3.6, 5);
    expect(r.skipped).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.deviationPercent).toBeCloseTo(((3.6 - 3.5) / 3.5) * 100);
  });

  it('fails beyond tolerance', () => {
    const r = checkWeightTolerance(3.5, 3.8, 5);
    expect(r.ok).toBe(false);
  });

  it('skips when no measured weight', () => {
    const r = checkWeightTolerance(3.5, 0, 5);
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('no_measured');
  });
});
