import { describe, it, expect } from 'vitest';
import {
  BATCH_FIELD_MAX_LEN,
  BATCH_NO_UNTAGGED,
  batchNoForDisplay,
  batchNoForWrite,
  isUntaggedBatch,
  normalizeBatchNo,
  normalizeCollabSpecLabel,
} from './types';

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

describe('isUntaggedBatch / batchNoForDisplay / batchNoForWrite', () => {
  it('isUntaggedBatch detects null/empty/sentinel', () => {
    expect(isUntaggedBatch(null)).toBe(true);
    expect(isUntaggedBatch(undefined)).toBe(true);
    expect(isUntaggedBatch('')).toBe(true);
    expect(isUntaggedBatch('   ')).toBe(true);
    expect(isUntaggedBatch(BATCH_NO_UNTAGGED)).toBe(true);
    expect(isUntaggedBatch('B1')).toBe(false);
  });

  it('batchNoForDisplay maps untagged to sentinel and trims real values', () => {
    expect(batchNoForDisplay(null)).toBe(BATCH_NO_UNTAGGED);
    expect(batchNoForDisplay('')).toBe(BATCH_NO_UNTAGGED);
    expect(batchNoForDisplay(BATCH_NO_UNTAGGED)).toBe(BATCH_NO_UNTAGGED);
    expect(batchNoForDisplay('  B1  ')).toBe('B1');
  });

  it('batchNoForWrite returns undefined for sentinel/empty and normalizes real values', () => {
    expect(batchNoForWrite(null)).toBeUndefined();
    expect(batchNoForWrite('')).toBeUndefined();
    expect(batchNoForWrite(BATCH_NO_UNTAGGED)).toBeUndefined();
    expect(batchNoForWrite('  B1  ')).toBe('B1');
  });
});

describe('normalizeCollabSpecLabel', () => {
  it('applies NFKC (e.g. fullwidth Latin)', () => {
    expect(normalizeCollabSpecLabel('\uFF21\uFF22')).toBe('AB');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeCollabSpecLabel('  红  色  ')).toBe('红 色');
  });

  it('returns null for empty', () => {
    expect(normalizeCollabSpecLabel('')).toBeNull();
    expect(normalizeCollabSpecLabel('   ')).toBeNull();
    expect(normalizeCollabSpecLabel(null)).toBeNull();
  });
});
