import { describe, it, expect } from 'vitest';
import {
  sumBlockOrderQty,
  sumVariantQtyInOrders,
  pmpCompletedAtTemplate,
  pmpCompletedAtTemplateVariant,
  orderMaxReportableAtTemplateProductAware,
} from './productReportAggregates';
import { MilestoneStatus, OrderStatus } from '../types';
import type { ProductionOrder, ProductMilestoneProgress } from '../types';

function makeOrder(id: string, items: { quantity: number; variantId?: string }[], milestones: { templateId: string; completedQuantity?: number }[] = []): ProductionOrder {
  return {
    id,
    orderNumber: `WO-${id}`,
    productId: 'prod-1',
    productName: 'Test',
    sku: 'SKU-1',
    items: items.map(i => ({ quantity: i.quantity, completedQuantity: 0, variantId: i.variantId })),
    customer: '',
    startDate: '2026-01-01',
    dueDate: '2026-02-01',
    status: OrderStatus.PRODUCING,
    milestones: milestones.map(m => ({
      id: `ms-${m.templateId}`,
      templateId: m.templateId,
      name: m.templateId,
      status: MilestoneStatus.PENDING,
      plannedDate: '2026-01-15',
      completedQuantity: m.completedQuantity ?? 0,
      reportTemplate: [],
      reports: [],
      weight: 1,
    })),
    priority: 'Medium',
  };
}

describe('sumBlockOrderQty', () => {
  it('sums quantities across all orders and items', () => {
    const orders = [
      makeOrder('a', [{ quantity: 100 }, { quantity: 50 }]),
      makeOrder('b', [{ quantity: 200 }]),
    ];
    expect(sumBlockOrderQty(orders)).toBe(350);
  });

  it('returns 0 for empty array', () => {
    expect(sumBlockOrderQty([])).toBe(0);
  });
});

describe('sumVariantQtyInOrders', () => {
  it('sums only matching variant quantities', () => {
    const orders = [
      makeOrder('a', [
        { quantity: 30, variantId: 'v-red' },
        { quantity: 20, variantId: 'v-blue' },
      ]),
      makeOrder('b', [
        { quantity: 10, variantId: 'v-red' },
      ]),
    ];
    expect(sumVariantQtyInOrders(orders, 'v-red')).toBe(40);
    expect(sumVariantQtyInOrders(orders, 'v-blue')).toBe(20);
  });

  it('treats empty variantId as matching empty string', () => {
    const orders = [makeOrder('a', [{ quantity: 50 }])];
    expect(sumVariantQtyInOrders(orders, '')).toBe(50);
  });
});

describe('pmpCompletedAtTemplate', () => {
  it('sums completed quantity for matching product+template', () => {
    const pmp: ProductMilestoneProgress[] = [
      { id: '1', productId: 'p1', milestoneTemplateId: 't1', completedQuantity: 30 },
      { id: '2', productId: 'p1', milestoneTemplateId: 't1', completedQuantity: 20 },
      { id: '3', productId: 'p1', milestoneTemplateId: 't2', completedQuantity: 99 },
      { id: '4', productId: 'p2', milestoneTemplateId: 't1', completedQuantity: 88 },
    ];
    expect(pmpCompletedAtTemplate(pmp, 'p1', 't1')).toBe(50);
  });

  it('returns 0 when no match', () => {
    expect(pmpCompletedAtTemplate([], 'p1', 't1')).toBe(0);
  });
});

describe('pmpCompletedAtTemplateVariant', () => {
  it('filters by variant in addition to product+template', () => {
    const pmp: ProductMilestoneProgress[] = [
      { id: '1', productId: 'p1', milestoneTemplateId: 't1', variantId: 'v-red', completedQuantity: 10 },
      { id: '2', productId: 'p1', milestoneTemplateId: 't1', variantId: 'v-blue', completedQuantity: 5 },
      { id: '3', productId: 'p1', milestoneTemplateId: 't1', completedQuantity: 15 },
    ];
    expect(pmpCompletedAtTemplateVariant(pmp, 'p1', 't1', 'v-red')).toBe(10);
    expect(pmpCompletedAtTemplateVariant(pmp, 'p1', 't1', '')).toBe(15);
  });
});

describe('orderMaxReportableAtTemplateProductAware', () => {
  it('free mode: returns orderQty - defective + rework', () => {
    const order = makeOrder('a', [{ quantity: 100 }], [{ templateId: 'node1' }]);
    const result = orderMaxReportableAtTemplateProductAware(order, 'node1', {
      processSequenceMode: 'free',
      productId: 'prod-1',
      pmp: [],
      blockOrders: [order],
      defective: 10,
      rework: 3,
    });
    expect(result).toBe(93);
  });

  it('sequential mode first node: same as free', () => {
    const order = makeOrder('a', [{ quantity: 200 }], [{ templateId: 'node1' }]);
    const result = orderMaxReportableAtTemplateProductAware(order, 'node1', {
      processSequenceMode: 'sequential',
      productId: 'prod-1',
      pmp: [],
      blockOrders: [order],
      defective: 0,
      rework: 0,
    });
    expect(result).toBe(200);
  });

  it('sequential mode second node: limited by previous milestone completion', () => {
    const order = makeOrder('a', [{ quantity: 100 }], [
      { templateId: 'node1', completedQuantity: 60 },
      { templateId: 'node2' },
    ]);
    const result = orderMaxReportableAtTemplateProductAware(order, 'node2', {
      processSequenceMode: 'sequential',
      productId: 'prod-1',
      pmp: [],
      blockOrders: [order],
      defective: 5,
      rework: 2,
    });
    expect(result).toBe(57);
  });

  it('returns 0 for non-existent templateId', () => {
    const order = makeOrder('a', [{ quantity: 100 }], [{ templateId: 'node1' }]);
    const result = orderMaxReportableAtTemplateProductAware(order, 'node-missing', {
      processSequenceMode: 'free',
      productId: 'prod-1',
      pmp: [],
      blockOrders: [order],
      defective: 0,
      rework: 0,
    });
    expect(result).toBe(0);
  });

  it('never returns negative', () => {
    const order = makeOrder('a', [{ quantity: 10 }], [{ templateId: 'node1' }]);
    const result = orderMaxReportableAtTemplateProductAware(order, 'node1', {
      processSequenceMode: 'free',
      productId: 'prod-1',
      pmp: [],
      blockOrders: [order],
      defective: 50,
      rework: 0,
    });
    expect(result).toBe(0);
  });
});
