import { describe, expect, it } from 'vitest';
import {
  parseScaleInputText,
  parseScaleLine,
  extractWeightFromCaptureText,
} from './parseScaleInput';

describe('parseScaleInput', () => {
  it('parses plain kg number', () => {
    expect(parseScaleInputText('0.193')).toBe(0.193);
    expect(parseScaleInputText('0.193kg')).toBe(0.193);
  });

  it('parses grams', () => {
    expect(parseScaleInputText('193g')).toBe(0.193);
  });

  it('parses ST,GS comma format', () => {
    const r = parseScaleLine('ST,GS,+003.500kg');
    expect(r?.weightKg).toBe(3.5);
    expect(r?.stable).toBe(true);
  });

  it('returns null for empty or invalid', () => {
    expect(parseScaleInputText('')).toBeNull();
    expect(parseScaleInputText('abc')).toBeNull();
  });
});

describe('extractWeightFromCaptureText', () => {
  it('extracts from plain and contaminated input', () => {
    expect(extractWeightFromCaptureText('0.194')).toBe(0.194);
    expect(extractWeightFromCaptureText('0.194HTTP://LOCALHOST/SCAN/X')).toBe(0.194);
    expect(extractWeightFromCaptureText('193')).toBe(0.193);
    expect(extractWeightFromCaptureText('')).toBeNull();
    expect(extractWeightFromCaptureText('0')).toBeNull();
    expect(extractWeightFromCaptureText('HTTP://LOCALHOST:3000/SCAN/TOKEN')).toBeNull();
    expect(extractWeightFromCaptureText('3000')).toBeNull();
  });
});
