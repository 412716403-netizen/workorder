import { describe, it, expect } from 'vitest';
import { buildSalesBillPrintListRows } from './buildSalesBillPrintContext';
import type { AppDictionaries } from '../types';

const emptyDict = { colors: [], sizes: [] } as AppDictionaries;

describe('buildSalesBillPrintListRows batch', () => {
  it('uses batch when batchNo absent', () => {
    const rows = buildSalesBillPrintListRows(
      [{ id: '1', productId: 'p1', quantity: 2, salesPrice: 10, batch: 'B-01' }],
      new Map([
        [
          'p1',
          {
            id: 'p1',
            name: 'Prod',
            sku: 'S1',
            categoryId: 'c',
            purchasePrice: 0,
            salesPrice: 10,
          } as import('../types').Product,
        ],
      ]),
      emptyDict,
    );
    expect(rows[0]?.batchNo).toBe('B-01');
  });

  it('prefers batchNo over batch', () => {
    const rows = buildSalesBillPrintListRows(
      [{ id: '1', productId: 'p1', quantity: 1, salesPrice: 5, batch: 'OLD', batchNo: 'NEW' }],
      new Map([
        [
          'p1',
          {
            id: 'p1',
            name: 'Prod',
            sku: 'S1',
            categoryId: 'c',
            purchasePrice: 0,
            salesPrice: 5,
          } as import('../types').Product,
        ],
      ]),
      emptyDict,
    );
    expect(rows[0]?.batchNo).toBe('NEW');
  });
});
