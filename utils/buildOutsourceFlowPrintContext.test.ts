import { describe, it, expect } from 'vitest';
import { buildOutsourceFlowPrintContext } from './buildOutsourceFlowPrintContext';
import type { AppDictionaries, Product, ProductionOpRecord, ProductionOrder } from '../types';
import { COLOR_SIZE_MATRIX_JSON_KEY } from './colorSizeMatrixPrint';

const dict: AppDictionaries = {
  colors: [
    { id: 'c1', name: '白', value: 'c1' },
    { id: 'c2', name: '粉', value: 'c2' },
  ],
  sizes: [{ id: 's1', name: '均码', value: 's1' }],
  units: [],
};

describe('buildOutsourceFlowPrintContext', () => {
  it('aggregates variants per order+node and emits colorSizeMatrixJson', () => {
    const product: Product = {
      id: 'prod1',
      sku: '25012',
      name: '25012',
      colorIds: ['c1', 'c2'],
      sizeIds: ['s1'],
      variants: [
        { id: 'v1', colorId: 'c1', sizeId: 's1', skuSuffix: '' },
        { id: 'v2', colorId: 'c2', sizeId: 's1', skuSuffix: '' },
      ],
      milestoneNodeIds: ['n1'],
    };
    const order: ProductionOrder = {
      id: 'o1',
      orderNumber: 'WO-1',
      productId: 'prod1',
      productName: product.name,
      sku: product.sku,
      items: [],
      customer: '',
      startDate: '',
      dueDate: '',
      status: 'PRODUCING',
      milestones: [],
      priority: 'Medium',
    };
    const recs: ProductionOpRecord[] = [
      {
        id: 'r1',
        type: 'OUTSOURCE',
        productId: 'prod1',
        orderId: 'o1',
        nodeId: 'n1',
        variantId: 'v1',
        quantity: 50,
        operator: 'a',
        timestamp: '2026-01-01T00:00:00',
        docNo: 'WX-1',
        partner: '工厂',
        status: '加工中',
      },
      {
        id: 'r2',
        type: 'OUTSOURCE',
        productId: 'prod1',
        orderId: 'o1',
        nodeId: 'n1',
        variantId: 'v2',
        quantity: 50,
        operator: 'a',
        timestamp: '2026-01-01T00:00:00',
        docNo: 'WX-1',
        partner: '工厂',
        status: '加工中',
      },
    ];
    const ctx = buildOutsourceFlowPrintContext({
      docRecords: recs,
      isReceiveDoc: false,
      orders: [order],
      products: [product],
      globalNodes: [{ id: 'n1', name: '横机', reportTemplate: [] }],
      dictionaries: dict,
    });
    expect(ctx.printListRows?.length).toBe(1);
    const row = ctx.printListRows![0]!;
    expect(row.quantity).toBe(100);
    expect(row[COLOR_SIZE_MATRIX_JSON_KEY]).toBeTruthy();
    expect(String(row[COLOR_SIZE_MATRIX_JSON_KEY])).toContain('白');
    expect(String(row[COLOR_SIZE_MATRIX_JSON_KEY])).toContain('粉');
  });
});
