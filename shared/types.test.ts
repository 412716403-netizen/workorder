import { describe, it, expect } from 'vitest';
import { BATCH_FIELD_MAX_LEN, normalizeBatchNo } from './types';

describe('normalizeBatchNo', () => {
  it('trims and returns string', () => {
    expect(normalizeBatchNo('  A1  ')).toBe('A1');
  });

  it('returns undefined for null/undefined/empty/whitespace', () => {
    expect(normalizeBatchNo(null)).toBeUndefined();
    expect(normalizeBatchNo(undefined)).toBeUndefined();
    expect(normalizeBatchNo('')).toBeUndefined();
    expect(normalizeBatchNo('   ')).toBeUndefined();
  });

  it('coerces number to string', () => {
    expect(normalizeBatchNo(42)).toBe('42');
  });

  it('truncates to BATCH_FIELD_MAX_LEN', () => {
    const long = 'x'.repeat(BATCH_FIELD_MAX_LEN + 30);
    expect(normalizeBatchNo(long)?.length).toBe(BATCH_FIELD_MAX_LEN);
  });
});
