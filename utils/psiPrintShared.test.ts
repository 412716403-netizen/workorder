import { describe, it, expect } from 'vitest';
import { sumPsiLineQty, sumPsiLineAmount, groupPsiDocLines } from './psiPrintShared';
import type { Product } from '../types';

const makeProductMap = (...products: Partial<Product>[]): Map<string, Product> =>
  new Map(products.map(p => [p.id!, p as Product]));

describe('sumPsiLineQty', () => {
  it('sums simple quantities', () => {
    const lines = [
      { id: '1', productId: 'p1', quantity: 10 },
      { id: '2', productId: 'p2', quantity: 20 },
    ];
    expect(sumPsiLineQty(lines, makeProductMap())).toBe(30);
  });

  it('sums variant quantities when product has variants', () => {
    const lines = [
      { id: '1', productId: 'p1', variantQuantities: { v1: 5, v2: 8 } },
    ];
    const pm = makeProductMap({ id: 'p1', variants: [{ id: 'v1' }, { id: 'v2' }] as any });
    expect(sumPsiLineQty(lines, pm)).toBe(13);
  });

  it('returns 0 for empty lines', () => {
    expect(sumPsiLineQty([], makeProductMap())).toBe(0);
  });
});

describe('sumPsiLineAmount', () => {
  it('sums price * quantity', () => {
    const lines = [
      { id: '1', productId: 'p1', quantity: 10, price: 5 },
      { id: '2', productId: 'p2', quantity: 3, price: 20 },
    ];
    expect(sumPsiLineAmount(lines, makeProductMap(), l => l.price)).toBe(110);
  });

  it('sums variant quantities * price', () => {
    const lines = [
      { id: '1', productId: 'p1', variantQuantities: { v1: 2, v2: 3 }, price: 10 },
    ];
    const pm = makeProductMap({ id: 'p1', variants: [{ id: 'v1' }, { id: 'v2' }] as any });
    expect(sumPsiLineAmount(lines, pm, l => l.price)).toBe(50);
  });
});

describe('groupPsiDocLines', () => {
  it('groups doc items by lineGroupId', () => {
    const items = [
      { lineGroupId: 'g1', id: 'r1', productId: 'p1', quantity: 5, purchasePrice: 10 },
      { lineGroupId: 'g1', id: 'r2', productId: 'p1', quantity: 3, purchasePrice: 10, variantId: 'v1' },
      { lineGroupId: 'g2', id: 'r3', productId: 'p2', quantity: 7, purchasePrice: 20 },
    ];
    const result = groupPsiDocLines(items, (lgId, first, _recs, hasVar, vq, lineQtyNoVar) => ({
      id: lgId,
      productId: first.productId,
      quantity: hasVar ? undefined : lineQtyNoVar,
      price: first.purchasePrice,
    }));
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('g1');
    expect(result[1].id).toBe('g2');
    expect(result[1].quantity).toBe(7);
  });

  it('uses item id when lineGroupId is missing', () => {
    const items = [
      { id: 'r1', productId: 'p1', quantity: 5, purchasePrice: 10 },
    ];
    const result = groupPsiDocLines(items, (lgId) => ({ id: lgId }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });
});
