import { describe, it, expect } from 'vitest';
import { buildMaterialStockDocPrintContext } from './buildMaterialStockDocPrintContext';
import type { AppDictionaries, Product, ProductionOpRecord, ProductionOrder, Warehouse } from '../types';
import { COLOR_SIZE_MATRIX_JSON_KEY } from './colorSizeMatrixPrint';

const dict: AppDictionaries = {
  colors: [{ id: 'c1', name: '红', value: 'c1' }],
  sizes: [{ id: 's1', name: 'M', value: 's1' }],
  units: [],
};

describe('buildMaterialStockDocPrintContext', () => {
  const product: Product = {
    id: 'mat1',
    sku: 'M-SKU',
    name: '物料A',
    colorIds: ['c1'],
    sizeIds: ['s1'],
    variants: [{ id: 'mv1', colorId: 'c1', sizeId: 's1', skuSuffix: '' }],
    milestoneNodeIds: [],
  };
  const order: ProductionOrder = {
    id: 'o1',
    orderNumber: 'WO-1',
    productId: 'mat1',
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
  const wh: Warehouse = { id: 'w1', name: '仓', code: '', category: '', location: '', contact: '', description: '' };

  it('生产领料 flat rows have no colorSizeMatrixJson', () => {
    const recs: ProductionOpRecord[] = [
      {
        id: 'r1',
        type: 'STOCK_OUT',
        productId: 'mat1',
        orderId: 'o1',
        quantity: 3,
        operator: 'op',
        timestamp: '2026-01-01',
        docNo: 'LL1',
        warehouseId: 'w1',
      },
    ];
    const ctx = buildMaterialStockDocPrintContext({} as import('../types').PrintTemplate, {
      detail: {
        docNo: 'LL1',
        type: 'STOCK_OUT',
        orderId: 'o1',
        warehouseId: 'w1',
        lines: [{ productId: 'mat1', quantity: 3 }],
        partner: '',
      },
      records: recs,
      orders: [order],
      products: [product],
      warehouses: [wh],
      dictionaries: dict,
      customSnapshot: {},
    });
    expect(ctx.materialIssuePrint).toBeDefined();
    expect(ctx.printListRows?.[0]?.[COLOR_SIZE_MATRIX_JSON_KEY]).toBeUndefined();
  });

  it('生产退料 rows include colorSizeMatrixJson when records carry variantId', () => {
    const recs: ProductionOpRecord[] = [
      {
        id: 'r1',
        type: 'STOCK_RETURN',
        productId: 'mat1',
        orderId: 'o1',
        variantId: 'mv1',
        quantity: 2,
        operator: 'op',
        timestamp: '2026-01-01',
        docNo: 'TL1',
        warehouseId: 'w1',
      },
    ];
    const ctx = buildMaterialStockDocPrintContext({} as import('../types').PrintTemplate, {
      detail: {
        docNo: 'TL1',
        type: 'STOCK_RETURN',
        orderId: 'o1',
        warehouseId: 'w1',
        lines: [{ productId: 'mat1', quantity: 2 }],
        partner: '',
      },
      records: recs,
      orders: [order],
      products: [product],
      warehouses: [wh],
      dictionaries: dict,
      customSnapshot: {},
    });
    expect(ctx.materialReturnPrint).toBeDefined();
    expect(ctx.printListRows?.[0]?.[COLOR_SIZE_MATRIX_JSON_KEY]).toBeTruthy();
  });
});
