import { describe, expect, it } from 'vitest';
import type { Product, ProductionOrder, ProductionOpRecord, ProductMilestoneProgress } from '../types';
import { MilestoneStatus, OrderStatus } from '../types';
import {
  netOutsourceDispatchedProductNodeVariant,
  productOutsourceDispatchUsesAggregateVariantPool,
  sumOutsourceableByVariantProductMatrix,
} from './outsourceDispatchVariantCaps';

const product: Product = {
  id: 'p1',
  sku: 'SKU',
  name: '毛衣',
  colorIds: ['c1'],
  sizeIds: ['s1', 's2'],
  variants: [
    { id: 'v1', colorId: 'c1', sizeId: 's1', skuSuffix: '' },
    { id: 'v2', colorId: 'c1', sizeId: 's2', skuSuffix: '' },
  ],
  milestoneNodeIds: ['n1', 'n2'],
};

const order: ProductionOrder = {
  id: 'o1',
  orderNumber: 'W1',
  productId: 'p1',
  productName: '毛衣',
  sku: 'SKU',
  items: [
    { quantity: 50, completedQuantity: 0, variantId: 'v1' },
    { quantity: 50, completedQuantity: 0, variantId: 'v2' },
  ],
  customer: '',
  startDate: '',
  dueDate: '',
  status: OrderStatus.PRODUCING,
  milestones: [
    {
      id: 'm1',
      templateId: 'n1',
      name: 'n1',
      status: MilestoneStatus.PENDING,
      plannedDate: '',
      completedQuantity: 0,
      reportDisplayTemplate: [],
      reportTemplate: [],
      reports: [],
      weight: 1,
    },
    {
      id: 'm2',
      templateId: 'n2',
      name: 'n2',
      status: MilestoneStatus.PENDING,
      plannedDate: '',
      completedQuantity: 0,
      reportDisplayTemplate: [],
      reportTemplate: [],
      reports: [
        { variantId: 'v1', quantity: 20, defectiveQuantity: 0 },
        { variantId: 'v2', quantity: 20, defectiveQuantity: 0 },
      ],
      weight: 1,
    },
  ],
  priority: 'Medium',
};

describe('productOutsourceDispatchUsesAggregateVariantPool', () => {
  it('returns true when no variant hints on items or progress', () => {
    const o2: ProductionOrder = {
      ...order,
      items: [{ quantity: 100, completedQuantity: 0 }],
      milestones: order.milestones.map(m =>
        m.templateId === 'n2'
          ? { ...m, reports: [], completedQuantity: 0 }
          : m,
      ),
    };
    expect(productOutsourceDispatchUsesAggregateVariantPool([o2], [], 'p1', 'n2', product)).toBe(true);
  });

  it('returns false when milestone reports carry variant ids', () => {
    expect(productOutsourceDispatchUsesAggregateVariantPool([order], [], 'p1', 'n2', product)).toBe(false);
  });
});

describe('netOutsourceDispatchedProductNodeVariant', () => {
  it('subtracts received from sent for matching variant', () => {
    const records: ProductionOpRecord[] = [
      {
        id: '1',
        type: 'OUTSOURCE',
        productId: 'p1',
        nodeId: 'n2',
        quantity: 10,
        variantId: 'v1',
        status: '加工中',
        operator: 'a',
        timestamp: 't',
        docNo: 'd1',
        partner: 'x',
      },
      {
        id: '2',
        type: 'OUTSOURCE',
        productId: 'p1',
        nodeId: 'n2',
        quantity: 3,
        variantId: 'v1',
        status: '已收回',
        operator: 'a',
        timestamp: 't',
        docNo: 'd2',
        partner: 'x',
      },
    ];
    expect(netOutsourceDispatchedProductNodeVariant(records, 'p1', 'n2', 'v1')).toBe(7);
  });
});

describe('sumOutsourceableByVariantProductMatrix', () => {
  it('sums per-variant remaining outsourceable caps', () => {
    const pmp: ProductMilestoneProgress[] = [];
    const getDr = () => ({ defective: 0, rework: 0, reworkByVariant: {} });
    const sum = sumOutsourceableByVariantProductMatrix([], product, 'n2', [order], pmp, 'free', getDr, [order]);
    expect(sum).toBe(60);
  });
});
