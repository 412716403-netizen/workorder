import { describe, it, expect } from 'vitest';
import { sortedVariantColorEntries, sortedColorEntries } from './sortVariantsByProduct';
import type { ProductVariant } from '../types';

const mkVariant = (colorId: string, sizeId: string): ProductVariant => ({
  id: `${colorId}-${sizeId}`,
  colorId,
  sizeId,
  skuSuffix: `${colorId}/${sizeId}`,
});

describe('sortedVariantColorEntries', () => {
  it('sorts color groups by colorIds order', () => {
    const grouped: Record<string, ProductVariant[]> = {
      blue: [mkVariant('blue', 'M')],
      red: [mkVariant('red', 'M')],
      green: [mkVariant('green', 'M')],
    };
    const result = sortedVariantColorEntries(grouped, ['red', 'green', 'blue']);
    expect(result.map(([k]) => k)).toEqual(['red', 'green', 'blue']);
  });

  it('sorts variants within groups by sizeIds order', () => {
    const grouped: Record<string, ProductVariant[]> = {
      red: [mkVariant('red', 'XL'), mkVariant('red', 'S'), mkVariant('red', 'M')],
    };
    const result = sortedVariantColorEntries(grouped, undefined, ['S', 'M', 'XL']);
    expect(result[0][1].map(v => v.sizeId)).toEqual(['S', 'M', 'XL']);
  });

  it('returns original order when no sort keys provided', () => {
    const grouped: Record<string, ProductVariant[]> = {
      a: [mkVariant('a', '1')],
      b: [mkVariant('b', '1')],
    };
    const result = sortedVariantColorEntries(grouped);
    expect(result.length).toBe(2);
  });
});

describe('sortedColorEntries', () => {
  it('sorts generic entries by colorIds', () => {
    const grouped = { c3: 'third', c1: 'first', c2: 'second' };
    const result = sortedColorEntries(grouped, ['c1', 'c2', 'c3']);
    expect(result.map(([k]) => k)).toEqual(['c1', 'c2', 'c3']);
  });

  it('puts unknown colors at the end', () => {
    const grouped = { unknown: 1, known: 2 };
    const result = sortedColorEntries(grouped, ['known']);
    expect(result[0][0]).toBe('known');
    expect(result[1][0]).toBe('unknown');
  });
});
