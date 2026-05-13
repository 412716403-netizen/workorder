import { describe, expect, it } from 'vitest';
import type { Product, ProductCategory, ProductionOrder } from '../../types';
import { expandPendingByVariantForMatrix, buildStockInFormDefaultsForPending, type PendingStockItem } from './pendingStockStockInHelpers';

const category: ProductCategory = {
  id: 'c1',
  name: '针织',
  color: '',
  hasProcess: false,
  hasSalesPrice: false,
  hasPurchasePrice: false,
  hasColorSize: true,
  customFields: [],
};

const product: Product = {
  id: 'p1',
  sku: 'MY',
  name: '毛衣2',
  categoryId: 'c1',
  colorIds: ['grey'],
  sizeIds: ['s', 'm'],
  milestoneNodeIds: [],
  variants: [
    { id: 'v-s', colorId: 'grey', sizeId: 's', skuSuffix: '' },
    { id: 'v-m', colorId: 'grey', sizeId: 'm', skuSuffix: '' },
  ],
};

function makeItem(pb: Record<string, number>, pendingTotal: number, orders: ProductionOrder[]): PendingStockItem {
  return {
    rowKey: 'p1',
    ordersInRow: orders,
    order: orders[0],
    orderTotal: 100,
    productBlockOrderTotal: 100,
    alreadyIn: 0,
    pendingTotal,
    alreadyInByVariant: {},
    pendingByVariant: pb,
    productTotalStockIn: 0,
  };
}

describe('expandPendingByVariantForMatrix', () => {
  it('通栏待入库拆到各规格（按工单 items 占比）', () => {
    const order = {
      id: 'o1',
      productId: 'p1',
      productName: '毛衣2',
      items: [
        { variantId: 'v-s', quantity: 60 },
        { variantId: 'v-m', quantity: 40 },
      ],
      milestones: [],
    } as unknown as ProductionOrder;
    const item = makeItem({ '': 44 }, 44, [order]);
    const caps = expandPendingByVariantForMatrix(item, product, category);
    expect(caps['v-s'] + caps['v-m']).toBe(44);
    // variant id 按字典序：v-m 先于 v-s，先分摊 v-m
    expect(caps['v-m']).toBe(17);
    expect(caps['v-s']).toBe(27);
  });

  it('无行规格时均分', () => {
    const order = {
      id: 'o1',
      productId: 'p1',
      productName: '毛衣2',
      items: [{ quantity: 100 }],
      milestones: [],
    } as unknown as ProductionOrder;
    const item = makeItem({ '': 5 }, 5, [order]);
    const caps = expandPendingByVariantForMatrix(item, product, category);
    expect(caps['v-s'] + caps['v-m']).toBe(5);
    expect(Math.abs(caps['v-s'] - caps['v-m'])).toBeLessThanOrEqual(1);
  });
});

describe('buildStockInFormDefaultsForPending', () => {
  it('矩阵 + 通栏 pending 预填各规格', () => {
    const order = {
      id: 'o1',
      productId: 'p1',
      productName: '毛衣2',
      items: [
        { variantId: 'v-s', quantity: 50 },
        { variantId: 'v-m', quantity: 50 },
      ],
      milestones: [],
    } as unknown as ProductionOrder;
    const item = makeItem({ '': 10 }, 10, [order]);
    const d = buildStockInFormDefaultsForPending(item, product, category);
    expect(d.singleQuantity).toBe(0);
    expect((d.variantQuantities['v-s'] ?? 0) + (d.variantQuantities['v-m'] ?? 0)).toBe(10);
  });
});
