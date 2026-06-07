import { describe, it, expect } from 'vitest';
import {
  parsePsiNonVariantQuantityInput,
  parsePsiNonVariantQuantityInputOptional,
  parsePsiSignedQuantityInput,
  parsePsiSignedQuantityInputOptional,
  parsePsiIntegerQuantityInputOptional,
  parsePsiSignedIntegerQuantityInputOptional,
} from './psiQtyInput';

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

describe('parsePsiSignedQuantityInput', () => {
  it('returns 0 for empty or invalid', () => {
    expect(parsePsiSignedQuantityInput('')).toBe(0);
    expect(parsePsiSignedQuantityInput('  ')).toBe(0);
    expect(parsePsiSignedQuantityInput('.')).toBe(0);
    expect(parsePsiSignedQuantityInput('abc')).toBe(0);
  });

  it('parses negative quantities', () => {
    expect(parsePsiSignedQuantityInput('-3')).toBe(-3);
    expect(parsePsiSignedQuantityInput('-10.5')).toBe(-10.5);
    expect(parsePsiSignedQuantityInput('-0.01')).toBe(-0.01);
  });

  it('parses positive quantities', () => {
    expect(parsePsiSignedQuantityInput('12')).toBe(12);
    expect(parsePsiSignedQuantityInput('10.5')).toBe(10.5);
  });

  it('rounds to at most 2 decimal places', () => {
    expect(parsePsiSignedQuantityInput('-1.234')).toBe(-1.23);
    expect(parsePsiSignedQuantityInput('-1.235')).toBe(-1.24);
  });
});

describe('parsePsiSignedQuantityInputOptional', () => {
  it('returns undefined for empty input', () => {
    expect(parsePsiSignedQuantityInputOptional('')).toBeUndefined();
    expect(parsePsiSignedQuantityInputOptional('  ')).toBeUndefined();
  });

  it('parses signed numbers like the non-optional variant', () => {
    expect(parsePsiSignedQuantityInputOptional('-3')).toBe(-3);
    expect(parsePsiSignedQuantityInputOptional('12.5')).toBe(12.5);
  });
});

describe('parsePsiNonVariantQuantityInputOptional', () => {
  it('returns undefined for empty input', () => {
    expect(parsePsiNonVariantQuantityInputOptional('')).toBeUndefined();
  });

  it('parses non-negative decimals', () => {
    expect(parsePsiNonVariantQuantityInputOptional('10.5')).toBe(10.5);
    expect(parsePsiNonVariantQuantityInputOptional('-1')).toBe(0);
  });
});

describe('parsePsiIntegerQuantityInputOptional', () => {
  it('returns undefined for empty input', () => {
    expect(parsePsiIntegerQuantityInputOptional('')).toBeUndefined();
  });

  it('parses non-negative integers', () => {
    expect(parsePsiIntegerQuantityInputOptional('12')).toBe(12);
    expect(parsePsiIntegerQuantityInputOptional('-1')).toBeUndefined();
  });
});

describe('parsePsiSignedIntegerQuantityInputOptional', () => {
  it('returns undefined for empty or lone minus', () => {
    expect(parsePsiSignedIntegerQuantityInputOptional('')).toBeUndefined();
    expect(parsePsiSignedIntegerQuantityInputOptional('-')).toBeUndefined();
  });

  it('parses signed integers', () => {
    expect(parsePsiSignedIntegerQuantityInputOptional('-5')).toBe(-5);
    expect(parsePsiSignedIntegerQuantityInputOptional('8')).toBe(8);
  });
});
