import { describe, it, expect } from 'vitest';
import {
  validateProductCatalogUnique,
  PRODUCT_NAME_TAKEN_MSG,
} from '../../utils/productCatalogUnique';

describe('validateProductCatalogUnique (miniprogram parity)', () => {
  const catalog = [
    { id: 'p1', name: '产品A', sku: 'SKU-A' } as const,
    { id: 'p2', name: '产品B', sku: 'SKU-B' } as const,
  ];

  it('detects duplicate name', () => {
    expect(
      validateProductCatalogUnique(catalog as any, { name: '产品A', sku: 'NEW', excludeProductId: 'p9' }),
    ).toBe(PRODUCT_NAME_TAKEN_MSG);
  });

  it('allows same product to keep name', () => {
    expect(
      validateProductCatalogUnique(catalog as any, { name: '产品A', sku: 'SKU-A', excludeProductId: 'p1' }),
    ).toBeNull();
  });
});
