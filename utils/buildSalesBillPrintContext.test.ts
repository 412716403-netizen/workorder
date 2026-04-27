import { describe, it, expect } from 'vitest';
import {
  buildMatrixJsonAndTotalQtyFromVariantLine,
  buildSalesBillPrintListRows,
  buildSalesBillPrintListRowsByProductLine,
} from './buildSalesBillPrintContext';
import type { AppDictionaries, Product } from '../types';
import { COLOR_SIZE_MATRIX_JSON_KEY } from './colorSizeMatrixPrint';

const emptyDict: AppDictionaries = { colors: [], sizes: [], units: [] };

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

describe('buildSalesBillPrintListRowsByProductLine', () => {
  it('includes batchNo on matrix row when line has batchNo', () => {
    const product: Product = {
      id: 'p1',
      sku: 'SKU1',
      name: 'N1',
      colorIds: ['c1'],
      sizeIds: ['s1'],
      variants: [{ id: 'v1', colorId: 'c1', sizeId: 's1', skuSuffix: '' }],
      milestoneNodeIds: [],
    };
    const dict: AppDictionaries = {
      colors: [{ id: 'c1', name: '红', value: 'c1' }],
      sizes: [{ id: 's1', name: 'M', value: 's1' }],
      units: [],
    };
    const rows = buildSalesBillPrintListRowsByProductLine(
      [
        {
          id: 'L1',
          productId: 'p1',
          salesPrice: 3,
          variantQuantities: { v1: 4 },
          batchNo: 'BN-9',
        },
      ],
      new Map([['p1', product]]),
      dict,
    );
    expect(rows[0]?.batchNo).toBe('BN-9');
    expect(rows[0]?.[COLOR_SIZE_MATRIX_JSON_KEY]).toBeTruthy();
  });
});

describe('buildMatrixJsonAndTotalQtyFromVariantLine', () => {
  it('returns matrix json and total for variant map', () => {
    const product: Product = {
      id: 'p1',
      sku: 'S',
      name: 'P',
      colorIds: ['c1'],
      sizeIds: ['s1'],
      variants: [{ id: 'v1', colorId: 'c1', sizeId: 's1', skuSuffix: '' }],
      milestoneNodeIds: [],
    };
    const dict: AppDictionaries = {
      colors: [{ id: 'c1', name: '蓝', value: 'c1' }],
      sizes: [{ id: 's1', name: 'L', value: 's1' }],
      units: [],
    };
    const r = buildMatrixJsonAndTotalQtyFromVariantLine({
      productId: 'p1',
      productMap: new Map([['p1', product]]),
      dictionaries: dict,
      variantQuantities: { v1: 7 },
    });
    expect(r?.totalQty).toBe(7);
    expect(r?.colorSizeMatrixJson).toContain('蓝');
  });
});
