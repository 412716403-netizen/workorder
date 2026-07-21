import { describe, expect, it } from 'vitest';
import { PROD_OP_REASON_FROM_DEV, PROD_OP_REASON_FROM_REWORK } from '../shared/types';
import type { Product, ProductionOpRecord } from '../types';
import { BATCH_NO_UNTAGGED } from '../types';
import {
  buildOrderMaterialReturnable,
  toOrderCenterMaterialStats,
  aggregateReturnableByProduct,
} from './orderMaterialReturnable';

function rec(partial: Partial<ProductionOpRecord> & Pick<ProductionOpRecord, 'type' | 'productId' | 'quantity'>): ProductionOpRecord {
  return {
    id: partial.id ?? `id-${Math.random().toString(36).slice(2, 8)}`,
    type: partial.type,
    productId: partial.productId,
    quantity: partial.quantity,
    operator: partial.operator ?? 't',
    timestamp: partial.timestamp ?? '2026-01-01T00:00:00.000Z',
    status: partial.status ?? '已完成',
    orderId: partial.orderId,
    warehouseId: partial.warehouseId,
    batchNo: partial.batchNo,
    partner: partial.partner,
    reason: partial.reason,
    sourceProductId: partial.sourceProductId,
  };
}

describe('buildOrderMaterialReturnable', () => {
  const productsById = new Map<string, Product>([
    ['m1', { id: 'm1', name: '面料A', sku: 'SKU-A' } as Product],
    ['m2', { id: 'm2', name: '辅料B', sku: 'SKU-B' } as Product],
  ]);

  it('aggregates net returnable by product+warehouse+batch', () => {
    const rows = buildOrderMaterialReturnable(
      [
        rec({ type: 'STOCK_OUT', productId: 'm1', quantity: 10, warehouseId: 'w1', batchNo: 'B1', orderId: 'o1' }),
        rec({ type: 'STOCK_OUT', productId: 'm1', quantity: 5, warehouseId: 'w1', batchNo: 'B1', orderId: 'o1' }),
        rec({ type: 'STOCK_RETURN', productId: 'm1', quantity: 3, warehouseId: 'w1', batchNo: 'B1', orderId: 'o1' }),
        rec({ type: 'STOCK_OUT', productId: 'm1', quantity: 4, warehouseId: 'w1', batchNo: 'B2', orderId: 'o1' }),
      ],
      productsById,
    );
    expect(rows).toEqual([
      {
        productId: 'm1',
        productName: '面料A',
        productSku: 'SKU-A',
        warehouseId: 'w1',
        batchNo: 'B1',
        returnableQty: 12,
      },
      {
        productId: 'm1',
        productName: '面料A',
        productSku: 'SKU-A',
        warehouseId: 'w1',
        batchNo: 'B2',
        returnableQty: 4,
      },
    ]);
  });

  it('excludes partner / rework / dev / missing warehouse', () => {
    const rows = buildOrderMaterialReturnable(
      [
        rec({ type: 'STOCK_OUT', productId: 'm1', quantity: 10, warehouseId: 'w1', batchNo: 'B1' }),
        rec({ type: 'STOCK_OUT', productId: 'm1', quantity: 9, warehouseId: 'w1', batchNo: 'B1', partner: '厂A' }),
        rec({
          type: 'STOCK_OUT',
          productId: 'm1',
          quantity: 8,
          warehouseId: 'w1',
          batchNo: 'B1',
          reason: PROD_OP_REASON_FROM_REWORK,
        }),
        rec({
          type: 'STOCK_OUT',
          productId: 'm1',
          quantity: 7,
          warehouseId: 'w1',
          batchNo: 'B1',
          reason: PROD_OP_REASON_FROM_DEV,
        }),
        rec({ type: 'STOCK_OUT', productId: 'm2', quantity: 6, warehouseId: '', batchNo: 'B9' }),
      ],
      productsById,
    );
    expect(rows).toEqual([
      {
        productId: 'm1',
        productName: '面料A',
        productSku: 'SKU-A',
        warehouseId: 'w1',
        batchNo: 'B1',
        returnableQty: 10,
      },
    ]);
  });

  it('maps empty batchNo to untagged sentinel', () => {
    const rows = buildOrderMaterialReturnable(
      [rec({ type: 'STOCK_OUT', productId: 'm2', quantity: 2, warehouseId: 'w2' })],
      productsById,
    );
    expect(rows[0]?.batchNo).toBe(BATCH_NO_UNTAGGED);
    expect(rows[0]?.returnableQty).toBe(2);
  });

  it('drops fully returned lines', () => {
    const rows = buildOrderMaterialReturnable(
      [
        rec({ type: 'STOCK_OUT', productId: 'm1', quantity: 5, warehouseId: 'w1', batchNo: 'B1' }),
        rec({ type: 'STOCK_RETURN', productId: 'm1', quantity: 5, warehouseId: 'w1', batchNo: 'B1' }),
      ],
      productsById,
    );
    expect(rows).toEqual([]);
  });
});

describe('toOrderCenterMaterialStats', () => {
  it('rewrites issue/return to internal only and keeps report cost', () => {
    const rows = toOrderCenterMaterialStats(
      [
        { productId: 'm1', issue: 100, returnQty: 20, theoryCost: 3, actualCost: 1 },
        { productId: 'm2', issue: 50, returnQty: 0, theoryCost: 0, actualCost: 0 },
      ],
      [
        rec({ type: 'STOCK_OUT', productId: 'm1', quantity: 10, warehouseId: 'w1' }),
        rec({ type: 'STOCK_RETURN', productId: 'm1', quantity: 2, warehouseId: 'w1' }),
        rec({ type: 'STOCK_OUT', productId: 'm1', quantity: 8, warehouseId: 'w1', partner: '厂A' }),
        rec({
          type: 'STOCK_OUT',
          productId: 'm2',
          quantity: 50,
          warehouseId: 'w1',
          reason: PROD_OP_REASON_FROM_REWORK,
        }),
      ],
    );
    expect(rows).toEqual([
      { productId: 'm1', issue: 10, returnQty: 2, theoryCost: 3, actualCost: 1 },
    ]);
  });

  it('keeps report-only rows when no internal stock', () => {
    const rows = toOrderCenterMaterialStats(
      [{ productId: 'm1', issue: 9, returnQty: 0, theoryCost: 4, actualCost: 0 }],
      [rec({ type: 'STOCK_OUT', productId: 'm1', quantity: 9, warehouseId: 'w1', partner: '厂A' })],
    );
    expect(rows).toEqual([
      { productId: 'm1', issue: 0, returnQty: 0, theoryCost: 4, actualCost: 0 },
    ]);
  });
});

describe('aggregateReturnableByProduct', () => {
  it('merges same product batches into one row', () => {
    const rows = aggregateReturnableByProduct([
      {
        productId: 'm1',
        productName: '面料A',
        productSku: 'A',
        warehouseId: 'w1',
        batchNo: '23',
        returnableQty: 1,
      },
      {
        productId: 'm1',
        productName: '面料A',
        productSku: 'A',
        warehouseId: 'w1',
        batchNo: '212',
        returnableQty: 11,
      },
      {
        productId: 'm2',
        productName: '辅料B',
        productSku: 'B',
        warehouseId: 'w1',
        batchNo: '23',
        returnableQty: 0.5,
      },
    ]);
    expect(rows).toHaveLength(2);
    const m1 = rows.find(r => r.productId === 'm1')!;
    expect(m1.returnableQty).toBe(12);
    expect(m1.batches.map(b => b.batchNo).sort()).toEqual(['212', '23']);
  });
});
