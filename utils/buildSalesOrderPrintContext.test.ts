import { describe, it, expect } from 'vitest';
import { buildSalesOrderPrintContextFromPsiDoc } from './buildSalesOrderPrintContext';
import type { AppDictionaries, Product, PsiRecord } from '../types';

const dictionaries = {} as AppDictionaries;

const makeProductMap = (...products: Partial<Product>[]): Map<string, Product> =>
  new Map(products.map(p => [p.id!, p as Product]));

function rec(partial: Partial<PsiRecord>): PsiRecord {
  return {
    id: 'r',
    type: 'SALES_ORDER',
    productId: 'p1',
    ...partial,
  } as PsiRecord;
}

describe('buildSalesOrderPrintContextFromPsiDoc onlyUnshipped', () => {
  it('非变体行：未配货 = 订货 − 已配（已发+待发）', () => {
    // 订货 100，待发(allocated) 60、已发 0 → 已配 60 → 未配货 40
    const docItems = [
      rec({ id: 'l1', lineGroupId: 'l1', productId: 'p1', quantity: 100, salesPrice: 10, allocatedQuantity: 60, shippedQuantity: 0 }),
    ];
    const productMap = makeProductMap({ id: 'p1', name: '产品A', sku: 'A' });
    const ctx = buildSalesOrderPrintContextFromPsiDoc({
      docNumber: 'SO-1',
      docItems,
      productMap,
      dictionaries,
      onlyUnshipped: true,
    });
    expect(ctx.salesOrderPrint?.docTotalQty).toBe(40);
    expect(ctx.salesOrderPrint?.docTotalAmount).toBe(400);
    expect(ctx.printListRows).toHaveLength(1);
    expect(ctx.printListRows?.[0].qty).toBe(40);
  });

  it('已发+待发覆盖全部已配口径（已发 30、待发 30 → 已配 60）', () => {
    const docItems = [
      rec({ id: 'l1', lineGroupId: 'l1', productId: 'p1', quantity: 100, salesPrice: 10, allocatedQuantity: 60, shippedQuantity: 30 }),
    ];
    const productMap = makeProductMap({ id: 'p1', name: '产品A', sku: 'A' });
    const ctx = buildSalesOrderPrintContextFromPsiDoc({
      docNumber: 'SO-1',
      docItems,
      productMap,
      dictionaries,
      onlyUnshipped: true,
    });
    expect(ctx.salesOrderPrint?.docTotalQty).toBe(40);
  });

  it('整行已全部配货（未配货=0）时不出现在 printListRows', () => {
    const docItems = [
      rec({ id: 'l1', lineGroupId: 'l1', productId: 'p1', quantity: 50, salesPrice: 10, allocatedQuantity: 50, shippedQuantity: 50 }),
      rec({ id: 'l2', lineGroupId: 'l2', productId: 'p2', quantity: 100, salesPrice: 10, allocatedQuantity: 60, shippedQuantity: 0 }),
    ];
    const productMap = makeProductMap(
      { id: 'p1', name: '产品A', sku: 'A' },
      { id: 'p2', name: '产品B', sku: 'B' },
    );
    const ctx = buildSalesOrderPrintContextFromPsiDoc({
      docNumber: 'SO-1',
      docItems,
      productMap,
      dictionaries,
      onlyUnshipped: true,
    });
    expect(ctx.printListRows).toHaveLength(1);
    expect(ctx.printListRows?.[0].productName).toBe('产品B');
    expect(ctx.salesOrderPrint?.docTotalQty).toBe(40);
  });

  it('变体行：按 variantId 分别计算未配货并丢弃为 0 的规格', () => {
    // v1：订货30、已配10 → 未配货20；v2：订货20、已配20 → 未配货0（丢弃）
    const docItems = [
      rec({ id: 'a', lineGroupId: 'lg', productId: 'pv', variantId: 'v1', quantity: 30, salesPrice: 10, allocatedQuantity: 10, shippedQuantity: 0 }),
      rec({ id: 'b', lineGroupId: 'lg', productId: 'pv', variantId: 'v2', quantity: 20, salesPrice: 10, allocatedQuantity: 20, shippedQuantity: 0 }),
    ];
    const productMap = makeProductMap({
      id: 'pv',
      name: '变体产品',
      sku: 'PV',
      variants: [{ id: 'v1' }, { id: 'v2' }] as Product['variants'],
    });
    const ctx = buildSalesOrderPrintContextFromPsiDoc({
      docNumber: 'SO-1',
      docItems,
      productMap,
      dictionaries,
      onlyUnshipped: true,
    });
    expect(ctx.salesOrderPrint?.docTotalQty).toBe(20);
    expect(ctx.salesOrderPrint?.docTotalAmount).toBe(200);
    expect(ctx.printListRows).toHaveLength(1);
    expect(ctx.printListRows?.[0].qty).toBe(20);
  });

  it('onlyUnshipped 未开启时按全量打印', () => {
    const docItems = [
      rec({ id: 'l1', lineGroupId: 'l1', productId: 'p1', quantity: 100, salesPrice: 10, allocatedQuantity: 60, shippedQuantity: 0 }),
    ];
    const productMap = makeProductMap({ id: 'p1', name: '产品A', sku: 'A' });
    const ctx = buildSalesOrderPrintContextFromPsiDoc({
      docNumber: 'SO-1',
      docItems,
      productMap,
      dictionaries,
    });
    expect(ctx.salesOrderPrint?.docTotalQty).toBe(100);
    expect(ctx.printListRows?.[0].qty).toBe(100);
  });
});
