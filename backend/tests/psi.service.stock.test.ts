import { describe, it, expect, vi } from 'vitest';
import { getStock } from '../src/services/psi.service.js';

/** 最小 mock：`getStock` 内 6 路 `Promise.all` 的 `groupBy` / `groupBy` 形态 */
function createMockDb(handlers: {
  stocktakeSum?: 'diff' | 'quantity';
  purchaseQty?: number;
  stocktakeDiff?: number;
}) {
  const { stocktakeSum = 'diff', purchaseQty = 100, stocktakeDiff = -20 } = handlers;

  return {
    psiRecord: {
      groupBy: vi.fn(async (args: { where?: Record<string, unknown>; _sum?: Record<string, boolean> }) => {
        const w = args.where ?? {};
        const t = w.type;
        if (t && typeof t === 'object' && 'in' in t && Array.isArray((t as { in: string[] }).in)) {
          const types = (t as { in: string[] }).in;
          if (types.includes('PURCHASE_BILL')) {
            return [{ productId: 'p1', _sum: { quantity: purchaseQty } }];
          }
        }
        if (t === 'SALES_BILL') return [];
        if (t === 'TRANSFER' && w.toWarehouseId) return [];
        if (t === 'TRANSFER' && w.fromWarehouseId) return [];
        if (t === 'STOCKTAKE') {
          if (stocktakeSum === 'diff') {
            return [{ productId: 'p1', _sum: { diffQuantity: stocktakeDiff, quantity: null } }];
          }
          return [{ productId: 'p1', _sum: { quantity: 80, diffQuantity: null } }];
        }
        return [];
      }),
    },
    productionOpRecord: {
      groupBy: vi.fn(async () => []),
    },
  } as unknown as import('../src/lib/prisma.js').TenantPrismaClient;
}

describe('getStock STOCKTAKE', () => {
  it('uses diffQuantity sum: purchase 100 + stocktake diff -20 => stock 80', async () => {
    const db = createMockDb({ stocktakeSum: 'diff', purchaseQty: 100, stocktakeDiff: -20 });
    const rows = await getStock(db, { productId: 'p1', warehouseId: 'w1' });
    const p1 = rows.find(r => r.productId === 'p1');
    expect(p1?.stock).toBe(80);
  });

  it('if stocktake wrongly summed quantity 80, would inflate to 180 with purchase 100', async () => {
    const db = createMockDb({ stocktakeSum: 'quantity', purchaseQty: 100, stocktakeDiff: -20 });
    const rows = await getStock(db, { productId: 'p1', warehouseId: 'w1' });
    const p1 = rows.find(r => r.productId === 'p1');
    // 说明：mock 仍返回 quantity 聚合时，getStock 已改为读 diffQuantity，故此处 p1 为 0 或不存在
    expect(p1?.stock ?? 0).not.toBe(180);
  });
});
