import { describe, it, expect } from 'vitest';
import type { BOM, ProductionOpRecord, ProductionOrder, Product } from '../types';
import {
  computeOrderFamilyMaterialStats,
  computeProductMaterialStats,
  resolveRootOrderIdForMaterial,
} from './computeOrderMaterialStats';

const matA = 'mat-a';
const matB = 'mat-b';
const finished = 'prod-finished';
const nodeKnit = 'node-knit';

function makeIndexes(products: Product[], boms: BOM[]) {
  const productsById = new Map(products.map(p => [p.id, p]));
  const bomsById = new Map(boms.map(b => [b.id, b]));
  const bomsByParentProduct = new Map<string, BOM[]>();
  for (const b of boms) {
    const arr = bomsByParentProduct.get(b.parentProductId) ?? [];
    arr.push(b);
    bomsByParentProduct.set(b.parentProductId, arr);
  }
  return { productsById, bomsById, bomsByParentProduct };
}

describe('computeOrderFamilyMaterialStats', () => {
  const bom: BOM = {
    id: 'bom-1',
    name: 'BOM',
    parentProductId: finished,
    nodeId: nodeKnit,
    version: '1',
    items: [{ productId: matA, quantity: 2 }],
  };
  const product = {
    id: finished,
    name: '成品',
    sku: 'FP-001',
    categoryId: 'cat-1',
    colorIds: [],
    sizeIds: [],
    milestoneNodeIds: [],
    variants: [],
  } as Product;
  const { productsById, bomsById, bomsByParentProduct } = makeIndexes([product], [bom]);

  const parentOrder = {
    id: 'order-parent',
    orderNumber: 'WO-001',
    productId: finished,
    productName: '成品',
    sku: 'FP-001',
    customer: '',
    startDate: '',
    dueDate: '',
    status: 'IN_PROGRESS',
    priority: 'Medium',
    items: [{ quantity: 10, completedQuantity: 0 }],
    milestones: [
      {
        id: 'ms-1',
        name: '横机',
        templateId: nodeKnit,
        completedQuantity: 5,
        reports: [{ id: 'r1', quantity: 5, timestamp: '2026-01-01', operator: 'op', customData: {} }],
      },
    ],
  } as ProductionOrder;

  it('BOM 理论耗材 = 完成量 × 单位用量', () => {
    const rows = computeOrderFamilyMaterialStats({
      rootOrderId: 'order-parent',
      orders: [parentOrder],
      productsById,
      bomsById,
      bomsByParentProduct,
      childrenByParentId: new Map(),
      stockRecords: [],
      nodeWeightEnabledMap: new Map(),
    });
    const row = rows.find(r => r.productId === matA);
    expect(row?.theoryCost).toBe(10);
    expect(row?.issue).toBe(0);
  });

  it('累加领料与退料', () => {
    const stockRecords: ProductionOpRecord[] = [
      {
        id: 'so1',
        type: 'STOCK_OUT',
        orderId: 'order-parent',
        productId: matA,
        quantity: 8,
        operator: 'op',
        timestamp: '2026-01-01',
      },
      {
        id: 'sr1',
        type: 'STOCK_RETURN',
        orderId: 'order-parent',
        productId: matA,
        quantity: 1,
        operator: 'op',
        timestamp: '2026-01-02',
      },
    ];
    const rows = computeOrderFamilyMaterialStats({
      rootOrderId: 'order-parent',
      orders: [parentOrder],
      productsById,
      bomsById,
      bomsByParentProduct,
      childrenByParentId: new Map(),
      stockRecords,
      nodeWeightEnabledMap: new Map(),
    });
    const row = rows.find(r => r.productId === matA)!;
    expect(row.issue).toBe(8);
    expect(row.returnQty).toBe(1);
  });

  it('子工单领退料计入父工单族', () => {
    const childOrder: ProductionOrder = {
      ...parentOrder,
      id: 'order-child',
      parentOrderId: 'order-parent',
      orderNumber: 'WO-001-1',
    };
    const stockRecords: ProductionOpRecord[] = [
      {
        id: 'so1',
        type: 'STOCK_OUT',
        orderId: 'order-child',
        productId: matA,
        quantity: 3,
        operator: 'op',
        timestamp: '2026-01-01',
      },
    ];
    const childrenByParentId = new Map([['order-parent', [childOrder]]]);
    const rows = computeOrderFamilyMaterialStats({
      rootOrderId: 'order-parent',
      orders: [parentOrder, childOrder],
      productsById,
      bomsById,
      bomsByParentProduct,
      childrenByParentId,
      stockRecords,
      nodeWeightEnabledMap: new Map(),
    });
    expect(rows.find(r => r.productId === matA)?.issue).toBe(3);
  });
});

describe('computeProductMaterialStats', () => {
  it('sourceProductId 领退料计入成品聚合物料', () => {
    const bom: BOM = {
      id: 'bom-1',
      name: 'BOM',
      parentProductId: finished,
      nodeId: nodeKnit,
      version: '1',
      items: [{ productId: matB, quantity: 1 }],
    };
    const product = {
      id: finished,
      name: '成品',
      sku: 'FP',
      categoryId: 'c1',
      colorIds: [],
      sizeIds: [],
      milestoneNodeIds: [],
      variants: [],
    } as Product;
    const idx = {
      ...makeIndexes([product], [bom]),
      childrenByParentId: new Map<string, ProductionOrder[]>(),
      rootOrdersByProductId: new Map<string, ProductionOrder[]>(),
      ordersByProductId: new Map([[finished, []]]),
      ordersById: new Map<string, ProductionOrder>(),
    };
    const stockRecords: ProductionOpRecord[] = [
      {
        id: 'so1',
        type: 'STOCK_OUT',
        sourceProductId: finished,
        productId: matB,
        quantity: 4,
        operator: 'op',
        timestamp: '2026-01-01',
      },
    ];
    const rows = computeProductMaterialStats({
      productId: finished,
      orders: [],
      idx,
      stockRecords,
      productMilestoneProgresses: [],
      nodeWeightEnabledMap: new Map(),
    });
    expect(rows.find(r => r.productId === matB)?.issue).toBe(4);
  });
});

describe('resolveRootOrderIdForMaterial', () => {
  it('子工单解析到父工单根 id', () => {
    const orders = [
      { id: 'p', orderNumber: 'P', productId: 'x', productName: 'x', items: [], milestones: [] },
      { id: 'c', parentOrderId: 'p', orderNumber: 'C', productId: 'x', productName: 'x', items: [], milestones: [] },
    ] as ProductionOrder[];
    expect(resolveRootOrderIdForMaterial('c', orders)).toBe('p');
    expect(resolveRootOrderIdForMaterial('p', orders)).toBe('p');
  });
});
