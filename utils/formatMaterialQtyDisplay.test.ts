import { describe, expect, it } from 'vitest';
import { formatMaterialQtyDisplay } from './formatMaterialQtyDisplay';

describe('formatMaterialQtyDisplay', () => {
  it('trims float accumulation noise', () => {
    expect(formatMaterialQtyDisplay(20.299999999999997)).toBe('20.3');
    expect(formatMaterialQtyDisplay(28.000000000000004)).toBe('28');
    expect(formatMaterialQtyDisplay(0.1 + 0.2)).toBe('0.3');
  });

  it('keeps normal values as-is', () => {
    expect(formatMaterialQtyDisplay(5)).toBe('5');
    expect(formatMaterialQtyDisplay(1.25)).toBe('1.25');
    expect(formatMaterialQtyDisplay(0)).toBe('0');
  });

  it('falls back to 0 for non-finite input', () => {
    expect(formatMaterialQtyDisplay(NaN)).toBe('0');
    expect(formatMaterialQtyDisplay(Infinity)).toBe('0');
  });
});
