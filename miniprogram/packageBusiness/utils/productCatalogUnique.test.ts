import { describe, it, expect } from 'vitest';
import {
  validateProductCatalogUnique,
  PRODUCT_NAME_TAKEN_MSG,
} from './productCatalogUnique.js';

describe('validateProductCatalogUnique (miniprogram parity)', () => {
  const catalog = [
    { id: 'p1', name: '产品A', sku: 'SKU-A' },
    { id: 'p2', name: '产品B', sku: 'SKU-B' },
  ];

  it('detects duplicate product number (name)', () => {
    expect(
      validateProductCatalogUnique(catalog, { name: '产品A', sku: 'NEW', excludeProductId: 'p9' }),
    ).toBe(PRODUCT_NAME_TAKEN_MSG);
  });

  it('allows duplicate product name (sku)', () => {
    expect(
      validateProductCatalogUnique(catalog, { name: '新产品', sku: 'SKU-A', excludeProductId: 'p9' }),
    ).toBeNull();
  });

  it('allows same product to keep name', () => {
    expect(
      validateProductCatalogUnique(catalog, { name: '产品A', sku: 'SKU-A', excludeProductId: 'p1' }),
    ).toBeNull();
  });

  it('detects duplicate product number against other dev styles', () => {
    const styles = [
      { id: 's1', name: '开发款A' },
      { id: 's2', name: '开发款B' },
    ];
    expect(
      validateProductCatalogUnique(catalog, {
        name: '开发款A',
        sku: '',
        styles,
        excludeStyleId: 's-new',
      }),
    ).toBe(PRODUCT_NAME_TAKEN_MSG);
    expect(
      validateProductCatalogUnique(catalog, {
        name: '开发款A',
        sku: '',
        styles,
        excludeStyleId: 's1',
      }),
    ).toBeNull();
  });
});
