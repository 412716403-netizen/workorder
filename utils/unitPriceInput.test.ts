import { describe, expect, it } from 'vitest';
import {
  commitUnitPriceInput,
  formatUnitPriceInputValue,
  isAllowedUnitPriceDraft,
  isUnitPriceDraftComplete,
} from './unitPriceInput';

describe('formatUnitPriceInputValue', () => {
  it('hides zero so placeholder gray 0 can show', () => {
    expect(formatUnitPriceInputValue(0)).toBe('');
    expect(formatUnitPriceInputValue(0.5)).toBe('0.5');
    expect(formatUnitPriceInputValue(12)).toBe('12');
  });

  it('empty for nullish / non-finite', () => {
    expect(formatUnitPriceInputValue(undefined)).toBe('');
    expect(formatUnitPriceInputValue(null)).toBe('');
    expect(formatUnitPriceInputValue(Number.NaN)).toBe('');
  });
});

describe('isUnitPriceDraftComplete', () => {
  it('rejects intermediate drafts needed for 0-1 entry', () => {
    expect(isUnitPriceDraftComplete('')).toBe(false);
    expect(isUnitPriceDraftComplete('.')).toBe(false);
    expect(isUnitPriceDraftComplete('0.')).toBe(false);
    expect(isUnitPriceDraftComplete('1.')).toBe(false);
  });

  it('accepts complete values including 0 and fractions', () => {
    expect(isUnitPriceDraftComplete('0')).toBe(true);
    expect(isUnitPriceDraftComplete('0.5')).toBe(true);
    expect(isUnitPriceDraftComplete('.5')).toBe(true);
    expect(isUnitPriceDraftComplete('12.34')).toBe(true);
  });
});

describe('commitUnitPriceInput', () => {
  it('commits fractions between 0 and 1', () => {
    expect(commitUnitPriceInput('0.5')).toBe(0.5);
    expect(commitUnitPriceInput('.25')).toBe(0.25);
    expect(commitUnitPriceInput('0,8')).toBe(0.8);
  });

  it('empty / trailing-dot → emptyValue', () => {
    expect(commitUnitPriceInput('', 0)).toBe(0);
    expect(commitUnitPriceInput('0.', 0)).toBe(0);
    expect(commitUnitPriceInput('.', 7)).toBe(7);
  });
});

describe('isAllowedUnitPriceDraft', () => {
  it('allows decimal drafts and rejects junk', () => {
    expect(isAllowedUnitPriceDraft('0.')).toBe(true);
    expect(isAllowedUnitPriceDraft('0.12')).toBe(true);
    expect(isAllowedUnitPriceDraft('1a')).toBe(false);
    expect(isAllowedUnitPriceDraft('-1')).toBe(false);
  });
});
