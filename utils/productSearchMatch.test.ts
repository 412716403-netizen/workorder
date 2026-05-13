import { describe, expect, it } from 'vitest';
import type { Product, ProductCategory } from '../types';
import { productMatchesSearchQuery } from './productSearchMatch';

describe('productMatchesSearchQuery', () => {
  const cat: ProductCategory = {
    id: 'cat1',
    name: '成衣',
    color: '#000',
    hasProcess: true,
    hasSalesPrice: false,
    hasPurchasePrice: false,
    hasColorSize: true,
    customFields: [
      { id: 'f1', label: '内部代号', type: 'text', showInList: true, showInCreate: true, showInDetail: true },
    ],
  };

  it('matches name and sku', () => {
    const p: Product = {
      id: 'p1',
      sku: 'SKU-99',
      name: '测试衫',
      colorIds: [],
      sizeIds: [],
      variants: [],
      categoryId: 'cat1',
    };
    expect(productMatchesSearchQuery(p, cat, '测试')).toBe(true);
    expect(productMatchesSearchQuery(p, cat, 'sku-99')).toBe(true);
  });

  it('matches category custom field display', () => {
    const p: Product = {
      id: 'p1',
      sku: 'X',
      name: '无名',
      colorIds: [],
      sizeIds: [],
      variants: [],
      categoryId: 'cat1',
      categoryCustomData: { f1: 'ALPHA-7' },
    };
    expect(productMatchesSearchQuery(p, cat, 'alpha-7')).toBe(true);
    expect(productMatchesSearchQuery(p, cat, '内部代号')).toBe(true);
  });

  it('matches flattened route report text', () => {
    const p: Product = {
      id: 'p1',
      sku: 'X',
      name: 'Y',
      colorIds: [],
      sizeIds: [],
      variants: [],
      categoryId: 'cat1',
      routeReportValues: { nodeA: { fld: '特种缝纫说明' } },
    };
    expect(productMatchesSearchQuery(p, cat, '特种缝纫')).toBe(true);
  });
});
