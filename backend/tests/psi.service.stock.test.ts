import { describe, it, expect, vi } from 'vitest';
import { getStock, getStockBatches } from '../src/services/psi.service.js';
import { BATCH_NO_UNTAGGED } from '../../shared/types.js';

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

/** 模拟「采购入库未填批号 + 部分领料」：getStockBatches 应把 NULL 与 '12' 两个桶都返回。 */
function createBatchesMockDb() {
  return {
    psiRecord: {
      groupBy: vi.fn(async (args: { where?: Record<string, unknown> }) => {
        const w = args.where ?? {};
        const t = w.type;
        if (t && typeof t === 'object' && 'in' in t && Array.isArray((t as { in: string[] }).in)) {
          // PURCHASE_BILL/STOCK_IN：入库 60（无批号）+ 40（批号 12）
          return [
            { batchNo: null, _sum: { quantity: 60 } },
            { batchNo: '12', _sum: { quantity: 40 } },
          ];
        }
        return [];
      }),
    },
    productionOpRecord: {
      // STOCK_OUT 领走 10（无批号）；其它路径返回空。
      findMany: vi.fn(async (args: { where?: Record<string, unknown> }) => {
        const w = args.where ?? {};
        if (w.type === 'STOCK_OUT') {
          return [{ batchNo: null, quantity: 10 }];
        }
        return [];
      }),
    },
  } as unknown as import('../src/lib/prisma.js').TenantPrismaClient;
}

describe('getStockBatches NULL → BATCH_NO_UNTAGGED 哨兵聚合', () => {
  it('aggregates NULL batchNo records into the BATCH_NO_UNTAGGED bucket', async () => {
    const db = createBatchesMockDb();
    const rows = await getStockBatches(db, { productId: 'p1', warehouseId: 'w1' });
    const untagged = rows.find(r => r.batchNo === BATCH_NO_UNTAGGED);
    const real = rows.find(r => r.batchNo === '12');
    expect(untagged?.stock).toBe(50); // 60 入 - 10 出
    expect(real?.stock).toBe(40);
  });
});
