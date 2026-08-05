import { describe, expect, it } from 'vitest';
import type { AppDictionaries, Product } from '../types';
import {
  aggregateCollabColorSizeQty,
  aggregateVariantQty,
  getSingleFlowProductId,
  subtractVariantQty,
} from './flowListVariantQty';

describe('aggregateVariantQty', () => {
  it('按规格合并数量并保留未记录规格数量', () => {
    expect(
      aggregateVariantQty([
        { variantId: 'pink-s', quantity: 4 },
        { variantId: 'pink-s', quantity: 6 },
        { variantId: 'black-m', quantity: 3 },
        { quantity: 2 },
        { variantId: '  ', quantity: 1 },
      ]),
    ).toEqual({
      quantities: {
        'pink-s': 10,
        'black-m': 3,
      },
      unassignedQty: 3,
      totalQty: 16,
    });
  });
});

describe('subtractVariantQty', () => {
  it('按规格计算剩余数量', () => {
    const dispatched = aggregateVariantQty([
      { variantId: 'pink-s', quantity: 10 },
      { variantId: 'black-m', quantity: 8 },
      { quantity: 3 },
    ]);
    const received = aggregateVariantQty([
      { variantId: 'pink-s', quantity: 4 },
      { variantId: 'black-m', quantity: 3 },
      { quantity: 1 },
    ]);

    expect(subtractVariantQty(dispatched, received)).toEqual({
      quantities: {
        'pink-s': 6,
        'black-m': 5,
      },
      unassignedQty: 2,
      totalQty: 13,
    });
  });
});

describe('getSingleFlowProductId', () => {
  it('筛选结果只有一个产品时返回产品 ID', () => {
    expect(
      getSingleFlowProductId([
        { productId: 'product-1' },
        { productId: 'product-1' },
      ]),
    ).toBe('product-1');
  });

  it('多产品或无产品时不返回产品 ID', () => {
    expect(
      getSingleFlowProductId([
        { productId: 'product-1' },
        { productId: 'product-2' },
      ]),
    ).toBeNull();
    expect(getSingleFlowProductId([{ productId: '' }])).toBeNull();
  });
});

describe('aggregateCollabColorSizeQty', () => {
  const dictionaries: AppDictionaries = {
    colors: [
      { id: 'c-pink', name: '粉色', value: '#f9a' },
      { id: 'c-black', name: '黑色', value: '#111' },
    ],
    sizes: [
      { id: 's-s', name: 'S', value: 'S' },
      { id: 's-m', name: 'M', value: 'M' },
    ],
    units: [{ id: 'u-piece', name: '件', value: 'pcs' }],
  };

  const product: Product = {
    id: 'product-1',
    sku: 'SKU1',
    name: '毛衣',
    categoryId: 'cat1',
    colorIds: ['c-pink', 'c-black'],
    sizeIds: ['s-s', 's-m'],
    milestoneNodeIds: [],
    variants: [
      { id: 'pink-s', colorId: 'c-pink', sizeId: 's-s', skuSuffix: '' },
      { id: 'black-m', colorId: 'c-black', sizeId: 's-m', skuSuffix: '' },
    ],
  };

  it('将协作色码名映射到本地 variantId', () => {
    expect(
      aggregateCollabColorSizeQty(
        [
          { colorName: '粉色', sizeName: 'S', quantity: 4 },
          { colorName: '粉色', sizeName: 'S', quantity: 6 },
          { colorName: '黑色', sizeName: 'M', quantity: 3 },
          { colorName: '未知色', sizeName: 'S', quantity: 2 },
        ],
        product,
        dictionaries,
      ),
    ).toEqual({
      quantities: {
        'pink-s': 10,
        'black-m': 3,
      },
      unassignedQty: 2,
      totalQty: 15,
    });
  });
});
