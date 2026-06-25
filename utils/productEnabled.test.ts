import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { filterSelectableProducts, isProductEnabled } from './productEnabled';

const p = (id: string, enabled?: boolean): Product => ({
  id,
  sku: id,
  name: id,
  colorIds: [],
  sizeIds: [],
  variants: [],
  milestoneNodeIds: [],
  enabled,
});

describe('isProductEnabled', () => {
  it('treats undefined as enabled', () => {
    expect(isProductEnabled(p('a'))).toBe(true);
    expect(isProductEnabled(null)).toBe(true);
  });

  it('respects explicit false', () => {
    expect(isProductEnabled(p('a', false))).toBe(false);
    expect(isProductEnabled(p('a', true))).toBe(true);
  });
});

describe('filterSelectableProducts', () => {
  it('excludes disabled unless keepId matches', () => {
    const list = [p('a', true), p('b', false), p('c', true)];
    expect(filterSelectableProducts(list).map(x => x.id)).toEqual(['a', 'c']);
    expect(filterSelectableProducts(list, 'b').map(x => x.id)).toEqual(['a', 'b', 'c']);
  });
});
