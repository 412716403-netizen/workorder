import { describe, expect, it } from 'vitest';
import type { ProductionOpRecord } from '../types';
import { PROD_OP_REASON_FROM_DEV, PROD_OP_REASON_FROM_REWORK } from '../shared/types';
import {
  buildOutsourceMaterialSummary,
  hasOutsourceMaterialDispatch,
  listOutsourceDispatchPartners,
  matchesOutsourceMaterialScope,
  outsourceReturnableQty,
} from './outsourceMaterialStats';

const base = {
  id: '1',
  quantity: 10,
  status: '已完成',
  timestamp: '2026-07-21T00:00:00.000Z',
} as const;

describe('matchesOutsourceMaterialScope', () => {
  it('requires partner and excludes 开发/返工 reason', () => {
    expect(
      matchesOutsourceMaterialScope(
        { ...base, type: 'STOCK_OUT', productId: 'm1', orderId: 'o1', partner: '厂A' } as ProductionOpRecord,
        { productionLinkMode: 'order', orderId: 'o1' },
      ),
    ).toBe(true);
    expect(
      matchesOutsourceMaterialScope(
        { ...base, type: 'STOCK_OUT', productId: 'm1', orderId: 'o1' } as ProductionOpRecord,
        { productionLinkMode: 'order', orderId: 'o1' },
      ),
    ).toBe(false);
    expect(
      matchesOutsourceMaterialScope(
        {
          ...base,
          type: 'STOCK_OUT',
          productId: 'm1',
          orderId: 'o1',
          partner: '厂A',
          reason: PROD_OP_REASON_FROM_REWORK,
        } as ProductionOpRecord,
        { productionLinkMode: 'order', orderId: 'o1' },
      ),
    ).toBe(false);
    expect(
      matchesOutsourceMaterialScope(
        {
          ...base,
          type: 'STOCK_OUT',
          productId: 'm1',
          orderId: 'o1',
          partner: '厂A',
          reason: PROD_OP_REASON_FROM_DEV,
        } as ProductionOpRecord,
        { productionLinkMode: 'order', orderId: 'o1' },
      ),
    ).toBe(false);
  });

  it('product mode matches sourceProductId or related orderIds', () => {
    const scope = {
      productionLinkMode: 'product' as const,
      productId: 'fp1',
      relatedOrderIds: new Set(['o1']),
    };
    expect(
      matchesOutsourceMaterialScope(
        {
          ...base,
          type: 'STOCK_OUT',
          productId: 'm1',
          sourceProductId: 'fp1',
          partner: '厂A',
        } as ProductionOpRecord,
        scope,
      ),
    ).toBe(true);
    expect(
      matchesOutsourceMaterialScope(
        { ...base, type: 'STOCK_RETURN', productId: 'm1', orderId: 'o1', partner: '厂A' } as ProductionOpRecord,
        scope,
      ),
    ).toBe(true);
    expect(
      matchesOutsourceMaterialScope(
        { ...base, type: 'STOCK_OUT', productId: 'm1', orderId: 'o2', partner: '厂A' } as ProductionOpRecord,
        scope,
      ),
    ).toBe(false);
  });
});

describe('buildOutsourceMaterialSummary', () => {
  it('aggregates issued / returned / net / consumable / balance across partners', () => {
    const productsById = new Map([['m1', { name: '纱线', sku: 'Y1' }]]);
    const products = [
      {
        id: 'fp1',
        name: '成品',
        variants: [],
      },
    ] as unknown as import('../types').Product[];
    const boms = [
      {
        id: 'bom1',
        parentProductId: 'fp1',
        nodeId: 'n1',
        items: [{ productId: 'm1', quantity: 2 }],
      },
    ] as unknown as import('../types').BOM[];
    const rows = buildOutsourceMaterialSummary(
      [
        {
          ...base,
          id: 'a',
          type: 'STOCK_OUT',
          productId: 'm1',
          orderId: 'o1',
          partner: '厂A',
          quantity: 10,
        },
        {
          ...base,
          id: 'b',
          type: 'STOCK_OUT',
          productId: 'm1',
          orderId: 'o1',
          partner: '厂B',
          quantity: 5,
        },
        {
          ...base,
          id: 'c',
          type: 'STOCK_RETURN',
          productId: 'm1',
          orderId: 'o1',
          partner: '厂A',
          quantity: 3,
        },
        {
          ...base,
          id: 'd',
          type: 'OUTSOURCE',
          status: '已收回',
          productId: 'fp1',
          orderId: 'o1',
          partner: '厂A',
          nodeId: 'n1',
          quantity: 2,
        },
      ] as ProductionOpRecord[],
      productsById,
      { productionLinkMode: 'order', orderId: 'o1' },
      { finishedProductId: 'fp1', products, boms },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productId: 'm1',
      productName: '纱线',
      issuedQty: 15,
      returnedQty: 3,
      netQty: 12,
      consumableQty: 4,
      balanceQty: 8,
    });
  });
});

describe('outsourceReturnableQty', () => {
  it('never goes below zero', () => {
    expect(outsourceReturnableQty(10, 3, 2)).toBe(5);
    expect(outsourceReturnableQty(5, 10, 0)).toBe(0);
  });
});

describe('hasOutsourceMaterialDispatch / listOutsourceDispatchPartners', () => {
  const records = [
    {
      ...base,
      id: 'a',
      type: 'STOCK_OUT',
      productId: 'm1',
      orderId: 'o1',
      partner: '厂B',
    },
    {
      ...base,
      id: 'b',
      type: 'STOCK_OUT',
      productId: 'm1',
      orderId: 'o1',
      partner: '厂A',
    },
  ] as ProductionOpRecord[];
  const scope = { productionLinkMode: 'order' as const, orderId: 'o1' };

  it('detects dispatch and lists partners sorted', () => {
    expect(hasOutsourceMaterialDispatch(records, scope)).toBe(true);
    expect(listOutsourceDispatchPartners(records, scope)).toEqual(['厂A', '厂B']);
    expect(hasOutsourceMaterialDispatch([], scope)).toBe(false);
  });
});
