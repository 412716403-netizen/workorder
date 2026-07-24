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
    colorIds: [],
    sizeIds: [],
    variants: [],
    milestoneNodeIds: [],
    categoryCustomData: {},
    routeReportValues: {},
    routeReportDisplayValues: {},
  },
];

describe('productCatalogUnique', () => {
  it('仅拦截重复产品编号；产品名称允许重复', () => {
    expect(isProductNameTakenInCatalog(catalog, '经典T恤')).toBe(true);
    expect(isProductSkuTakenInCatalog(catalog, 'ST-001')).toBe(false);
    expect(validateProductCatalogUnique(catalog, { name: '经典T恤', sku: 'NEW-01' })).toMatch(/产品编号/);
    expect(validateProductCatalogUnique(catalog, { name: '新款', sku: 'ST-001' })).toBeNull();
  });

  it('excludes current product id when editing', () => {
    expect(isProductNameTakenInCatalog(catalog, '经典T恤', 'p1')).toBe(false);
    expect(validateProductCatalogUnique(catalog, { name: '经典T恤', sku: 'ST-001', excludeProductId: 'p1' })).toBeNull();
  });
});
