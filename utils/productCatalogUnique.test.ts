import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import {
  isProductNameTakenInCatalog,
  isProductSkuTakenInCatalog,
  validateProductCatalogUnique,
} from './productCatalogUnique';

const catalog: Product[] = [
  {
    id: 'p1',
    sku: 'ST-001',
    name: '经典T恤',
    categoryId: 'cat1',
    milestoneNodeIds: [],
    categoryCustomData: {},
    routeReportValues: {},
    routeReportDisplayValues: {},
  },
];

describe('productCatalogUnique', () => {
  it('detects duplicate name and sku', () => {
    expect(isProductNameTakenInCatalog(catalog, '经典T恤')).toBe(true);
    expect(isProductSkuTakenInCatalog(catalog, 'ST-001')).toBe(true);
    expect(validateProductCatalogUnique(catalog, { name: '经典T恤', sku: 'NEW-01' })).toMatch(/名称/);
    expect(validateProductCatalogUnique(catalog, { name: '新款', sku: 'ST-001' })).toMatch(/编号/);
  });

  it('excludes current product id when editing', () => {
    expect(isProductNameTakenInCatalog(catalog, '经典T恤', 'p1')).toBe(false);
    expect(validateProductCatalogUnique(catalog, { name: '经典T恤', sku: 'ST-001', excludeProductId: 'p1' })).toBeNull();
  });
});
