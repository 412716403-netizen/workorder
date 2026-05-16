import { describe, expect, it } from 'vitest';
import {
  addScanQtyToStockInForm,
  findPendingStockRowForScan,
  tryAddScanQtyToStockInForm,
} from './pendingStockScanMatch';
import type { PendingStockItem } from '../views/order-list/pendingStockStockInHelpers';

function row(partial: Partial<PendingStockItem> & Pick<PendingStockItem, 'rowKey' | 'order'>): PendingStockItem {
  return {
    ordersInRow: [partial.order],
    orderTotal: 10,
    productBlockOrderTotal: 10,
    alreadyIn: 0,
    pendingTotal: 5,
    alreadyInByVariant: {},
    pendingByVariant: { v1: 5 },
    ...partial,
  };
}

describe('findPendingStockRowForScan', () => {
  const orderA = {
    id: 'o1',
    orderNumber: 'WO1',
    planOrderId: 'p1',
    productId: 'prod1',
    productName: '毛衣',
    items: [],
    milestones: [],
  } as PendingStockItem['order'];

  const items = [
    row({ rowKey: 'o1', order: orderA }),
    row({
      rowKey: 'o2',
      order: { ...orderA, id: 'o2', orderNumber: 'WO2', planOrderId: 'p2' },
    }),
  ];

  it('matches order mode by plan and order number', () => {
    expect(
      findPendingStockRowForScan(items, {
        productId: 'prod1',
        planOrderId: 'p1',
        orderNumbers: ['WO1'],
        productionLinkMode: 'order',
      })?.rowKey,
    ).toBe('o1');
  });

  it('returns null when ambiguous', () => {
    expect(
      findPendingStockRowForScan(items, {
        productId: 'prod1',
        productionLinkMode: 'order',
      }),
    ).toBeNull();
  });
});

describe('tryAddScanQtyToStockInForm', () => {
  it('accepts add when within variant cap', () => {
    const result = tryAddScanQtyToStockInForm(
      { variantQuantities: { v1: 2 }, singleQuantity: 0 },
      {
        hasColorSize: true,
        pendingTotal: 5,
        pendingByVariant: { v1: 5 },
        variantId: 'v1',
        addQty: 3,
      },
    );
    if (!result.ok) throw new Error('expected success');
    expect(result.appliedQty).toBe(3);
    expect(result.form.variantQuantities.v1).toBe(5);
  });

  it('rejects add when exceeding variant cap (no silent truncation)', () => {
    const result = tryAddScanQtyToStockInForm(
      { variantQuantities: { v1: 4 }, singleQuantity: 0 },
      {
        hasColorSize: true,
        pendingTotal: 5,
        pendingByVariant: { v1: 5 },
        variantId: 'v1',
        addQty: 3,
      },
    );
    expect(result.ok).toBe(false);
    expect((result as Extract<typeof result, { ok: false }>).reason).toBe('EXCEEDS_MAX');
    expect((result as Extract<typeof result, { ok: false }>).max).toBe(5);
    expect((result as Extract<typeof result, { ok: false }>).current).toBe(4);
    expect((result as Extract<typeof result, { ok: false }>).message).toContain('已超过');
  });

  it('rejects single-variant add over pendingTotal', () => {
    const result = tryAddScanQtyToStockInForm(
      { variantQuantities: {}, singleQuantity: 4 },
      {
        hasColorSize: false,
        pendingTotal: 5,
        pendingByVariant: {},
        variantId: '',
        addQty: 3,
      },
    );
    expect(result.ok).toBe(false);
  });
});

describe('addScanQtyToStockInForm (legacy)', () => {
  it('keeps form unchanged when over cap (no longer truncates)', () => {
    const next = addScanQtyToStockInForm(
      { variantQuantities: { v1: 4 }, singleQuantity: 0 },
      {
        hasColorSize: true,
        pendingTotal: 5,
        pendingByVariant: { v1: 5 },
        variantId: 'v1',
        addQty: 3,
      },
    );
    expect(next.variantQuantities.v1).toBe(4);
  });
});
