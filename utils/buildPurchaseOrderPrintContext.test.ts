import { describe, expect, it } from 'vitest';
import type { AppDictionaries, Product } from '../types';
import { buildPurchaseOrderPrintRenderContext } from './buildPurchaseOrderPrintContext';

const emptyDict: AppDictionaries = {
  colors: [],
  sizes: [],
  units: [],
};

describe('buildPurchaseOrderPrintRenderContext relatedProduct', () => {
  it('从表头 customData.relatedProductId 组装关联产品文案', () => {
    const productMap = new Map<string, Product>([
      [
        'fg-1',
        {
          id: 'fg-1',
          name: '成品甲',
          sku: 'FG-001',
          categoryId: 'c1',
          unitId: 'u1',
          variants: [],
          milestoneNodeIds: [],
        } as Product,
      ],
      [
        'mat-1',
        {
          id: 'mat-1',
          name: '面料',
          sku: 'M-01',
          categoryId: 'c1',
          unitId: 'u1',
          variants: [],
          milestoneNodeIds: [],
        } as Product,
      ],
    ]);
    const ctx = buildPurchaseOrderPrintRenderContext({
      docNumber: 'PO-1',
      partner: '供应商A',
      operator: '经办',
      customData: { relatedProductId: 'fg-1' },
      lines: [{ id: 'l1', productId: 'mat-1', quantity: 10, purchasePrice: 2 }],
      productMap,
      dictionaries: emptyDict,
    });
    expect(ctx.purchaseOrderPrint?.relatedProduct).toBe('成品甲（FG-001）');
  });

  it('无关联产品时不写入 relatedProduct', () => {
    const productMap = new Map<string, Product>();
    const ctx = buildPurchaseOrderPrintRenderContext({
      docNumber: 'PO-2',
      partner: '供应商B',
      lines: [{ id: 'l1', productId: 'x', quantity: 1, purchasePrice: 1 }],
      productMap,
      dictionaries: emptyDict,
    });
    expect(ctx.purchaseOrderPrint?.relatedProduct).toBeUndefined();
  });
});
