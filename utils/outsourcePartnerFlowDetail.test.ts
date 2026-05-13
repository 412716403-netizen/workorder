import { describe, expect, it } from 'vitest';
import type { Product, ProductCategory } from '../types';
import { orderedVariantColumnIds } from './outsourcePartnerFlowDetail';

describe('orderedVariantColumnIds', () => {
  const category: ProductCategory = {
    id: 'cat1',
    name: '针织',
    color: '',
    hasProcess: false,
    hasSalesPrice: false,
    hasPurchasePrice: false,
    hasColorSize: true,
    customFields: [],
  };

  const product: Product = {
    id: 'prod1',
    sku: 'MY15',
    name: '毛衣15',
    categoryId: 'cat1',
    colorIds: ['grey', 'white'],
    sizeIds: ['s', 'm', 'l'],
    milestoneNodeIds: [],
    variants: [
      { id: 'white-s', colorId: 'white', sizeId: 's', skuSuffix: '' },
      { id: 'grey-m', colorId: 'grey', sizeId: 'm', skuSuffix: '' },
      { id: 'grey-s', colorId: 'grey', sizeId: 's', skuSuffix: '' },
      { id: 'white-l', colorId: 'white', sizeId: 'l', skuSuffix: '' },
      { id: 'white-m', colorId: 'white', sizeId: 'm', skuSuffix: '' },
      { id: 'grey-l', colorId: 'grey', sizeId: 'l', skuSuffix: '' },
    ],
  };

  it('按产品颜色顺序再尺码顺序排列列（同色相邻）', () => {
    const maps = [
      { 'white-s': 1, 'grey-m': 1, 'grey-s': 1, 'white-m': 1, 'grey-l': 1, 'white-l': 1 },
    ];
    expect(orderedVariantColumnIds(product, category, undefined, maps)).toEqual([
      'grey-s',
      'grey-m',
      'grey-l',
      'white-s',
      'white-m',
      'white-l',
    ]);
  });

  it('流水里出现的规格子集也按颜色尺码序', () => {
    const maps = [{ 'white-m': 2, 'grey-s': 1 }];
    expect(orderedVariantColumnIds(product, category, undefined, maps)).toEqual(['grey-s', 'white-m']);
  });
});
