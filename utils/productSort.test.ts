import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { compareProductsArchiveOrder, productSortTimeMs } from './productSort';

const base = (over: Partial<Product>): Product =>
  ({
    id: 'p-1-x',
    sku: 'S',
    name: 'A',
    colorIds: [],
    sizeIds: [],
    variants: [],
    milestoneNodeIds: [],
    ...over,
  }) as Product;

describe('productSort', () => {
  it('productSortTimeMs prefers createdAt', () => {
    const t = Date.parse('2026-01-15T00:00:00.000Z');
    expect(productSortTimeMs(base({ id: 'p-old-y', createdAt: '2026-01-15T00:00:00.000Z' }))).toBe(t);
  });

  it('productSortTimeMs parses p-<ms>- from id', () => {
    expect(productSortTimeMs(base({ id: 'p-1700000000000-abc' }))).toBe(1700000000000);
  });

  it('compareProductsArchiveOrder: newer first', () => {
    const old = base({ id: 'p-100-a', name: 'Old' });
    const neu = base({ id: 'p-200-b', name: 'New' });
    const list = [old, neu].sort(compareProductsArchiveOrder);
    expect(list[0]?.id).toBe('p-200-b');
    expect(list[1]?.id).toBe('p-100-a');
  });

  it('compareProductsArchiveOrder: tie-break by id desc', () => {
    const a = base({ id: 'p-100-aaa', createdAt: '2026-01-01T00:00:00.000Z' });
    const b = base({ id: 'p-100-bbb', createdAt: '2026-01-01T00:00:00.000Z' });
    const list = [a, b].sort(compareProductsArchiveOrder);
    expect(list[0]?.id).toBe('p-100-bbb');
    expect(list[1]?.id).toBe('p-100-aaa');
  });
});
