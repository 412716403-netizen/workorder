import { describe, expect, it } from 'vitest';
import {
  aggregateFinanceByProductId,
  aggregatePurchaseByRelatedProduct,
  extractRelatedProductId,
  psiLineAmount,
} from './productDocumentLinkedCost';

describe('psiLineAmount', () => {
  it('uses amount when present', () => {
    expect(psiLineAmount({ amount: 100, quantity: 5, purchasePrice: 10 })).toBe(100);
  });

  it('falls back to qty × price', () => {
    expect(psiLineAmount({ quantity: 3, purchasePrice: 12.5 })).toBe(37.5);
  });
});

describe('extractRelatedProductId', () => {
  it('reads relatedProductId from customData', () => {
    expect(extractRelatedProductId({ relatedProductId: 'p1' })).toBe('p1');
    expect(extractRelatedProductId({})).toBe('');
  });
});

describe('aggregatePurchaseByRelatedProduct', () => {
  it('sums by related product', () => {
    const map = aggregatePurchaseByRelatedProduct([
      { customData: { relatedProductId: 'p1' }, amount: 100 },
      { customData: { relatedProductId: 'p1' }, quantity: 2, purchasePrice: 50 },
      { customData: { relatedProductId: 'p2' }, amount: 30 },
      { customData: {}, amount: 999 },
    ]);
    expect(map.get('p1')).toBe(200);
    expect(map.get('p2')).toBe(30);
    expect(map.has('')).toBe(false);
  });
});

describe('aggregateFinanceByProductId', () => {
  it('sums payments by product', () => {
    const map = aggregateFinanceByProductId([
      { productId: 'p1', amount: 80 },
      { productId: 'p1', amount: 20 },
      { productId: null, amount: 50 },
    ]);
    expect(map.get('p1')).toBe(100);
    expect(map.size).toBe(1);
  });
});
