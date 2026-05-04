import { describe, it, expect } from 'vitest';
import { parsePsiNonVariantQuantityInput } from './psiQtyInput';

describe('parsePsiNonVariantQuantityInput', () => {
  it('returns 0 for empty or invalid', () => {
    expect(parsePsiNonVariantQuantityInput('')).toBe(0);
    expect(parsePsiNonVariantQuantityInput('  ')).toBe(0);
    expect(parsePsiNonVariantQuantityInput('.')).toBe(0);
    expect(parsePsiNonVariantQuantityInput('abc')).toBe(0);
    expect(parsePsiNonVariantQuantityInput('-3')).toBe(0);
  });

  it('parses integers and decimals', () => {
    expect(parsePsiNonVariantQuantityInput('0')).toBe(0);
    expect(parsePsiNonVariantQuantityInput('12')).toBe(12);
    expect(parsePsiNonVariantQuantityInput('10.5')).toBe(10.5);
    expect(parsePsiNonVariantQuantityInput('0.01')).toBe(0.01);
  });

  it('rounds to at most 2 decimal places', () => {
    expect(parsePsiNonVariantQuantityInput('1.234')).toBe(1.23);
    expect(parsePsiNonVariantQuantityInput('1.235')).toBe(1.24);
    expect(parsePsiNonVariantQuantityInput('99.999')).toBe(100);
  });

  it('accepts comma as decimal separator', () => {
    expect(parsePsiNonVariantQuantityInput('3,14')).toBe(3.14);
  });
});
