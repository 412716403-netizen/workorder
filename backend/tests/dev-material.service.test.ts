import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../src/middleware/errorHandler.js';
import { DevStyleStatus, PROD_OP_REASON_FROM_DEV } from '../../shared/types.js';

const createRecordBatch = vi.fn();

vi.mock('../src/services/production.service.js', () => ({
  createRecordBatch: (...args: unknown[]) => createRecordBatch(...args),
}));

import {
  createDevMaterialIssueBatch,
  createDevMaterialReturnBatch,
  listDevMaterialRecords,
  countDevMaterialRecords,
} from '../src/services/dev-material.service.js';

function mockDb(opts: {
  styleStatus?: string;
  bomProductIds?: string[];
  opRows?: Array<Record<string, unknown>>;
}) {
  const styleStatus = opts.styleStatus ?? DevStyleStatus.DEVELOPING;
  const bomProductIds = opts.bomProductIds ?? ['m1'];
  const opRows = opts.opRows ?? [];
  return {
    devStyle: {
      findUnique: vi.fn(async () =>
        styleStatus
          ? { id: 'style1', status: styleStatus, code: 'D001', name: '样衣' }
          : null,
      ),
    },
    devBom: {
      findMany: vi.fn(async () => [
        { items: bomProductIds.map((productId) => ({ productId })) },
      ]),
    },
    productionOpRecord: {
      findMany: vi.fn(async () => opRows),
      count: vi.fn(async () => opRows.length),
    },
    product: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        (where.id.in || []).map((id) => ({ id, name: `P-${id}`, sku: id })),
      ),
    },
  } as unknown as import('../src/lib/prisma.js').TenantPrismaClient;
}

describe('dev-material.service', () => {
  beforeEach(() => {
    createRecordBatch.mockReset();
    createRecordBatch.mockResolvedValue({
      records: [{ id: 'r1', docNo: 'LL20260101001' }],
      dispatchCompletionPending: [],
    });
  });

  it('rejects issue when style is archived', async () => {
    const db = mockDb({ styleStatus: DevStyleStatus.ARCHIVED });
    await expect(
      createDevMaterialIssueBatch(db, 'tenant1', 'style1', {
        lines: [{ productId: 'm1', quantity: 1, warehouseId: 'wh1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(createRecordBatch).not.toHaveBeenCalled();
  });

  it('rejects issue for non-BOM material', async () => {
    const db = mockDb({ bomProductIds: ['m1'] });
    await expect(
      createDevMaterialIssueBatch(db, 'tenant1', 'style1', {
        lines: [{ productId: 'm9', quantity: 1, warehouseId: 'wh1' }],
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(createRecordBatch).not.toHaveBeenCalled();
  });

  it('writes trusted STOCK_OUT payload for issue', async () => {
    const db = mockDb({});
    const result = await createDevMaterialIssueBatch(db, 'tenant1', 'style1', {
      lines: [{ productId: 'm1', quantity: 2, warehouseId: 'wh1', batchNo: 'B1' }],
      operator: '张三',
    });
    expect(result.docNo).toBe('LL20260101001');
    expect(createRecordBatch).toHaveBeenCalledTimes(1);
    const [, records] = createRecordBatch.mock.calls[0];
    expect(records[0]).toMatchObject({
      type: 'STOCK_OUT',
      productId: 'm1',
      quantity: 2,
      warehouseId: 'wh1',
      batchNo: 'B1',
      reason: PROD_OP_REASON_FROM_DEV,
      partner: null,
      orderId: null,
      sourceProductId: null,
      status: '已完成',
      customData: { devStyleId: 'style1' },
    });
  });

  it('rejects return above returnable qty for same warehouse/batch', async () => {
    const db = mockDb({
      opRows: [
        {
          id: 'a',
          type: 'STOCK_OUT',
          productId: 'm1',
          quantity: 5,
          warehouseId: 'wh1',
          batchNo: 'B1',
          docNo: 'LL1',
          operator: null,
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'b',
          type: 'STOCK_RETURN',
          productId: 'm1',
          quantity: 2,
          warehouseId: 'wh1',
          batchNo: 'B1',
          docNo: 'TL1',
          operator: null,
          timestamp: new Date('2026-01-02T00:00:00Z'),
        },
      ],
    });
    await expect(
      createDevMaterialReturnBatch(db, 'tenant1', 'style1', {
        lines: [{ productId: 'm1', quantity: 4, warehouseId: 'wh1', batchNo: 'B1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('lists summary/returnable/docs for a style', async () => {
    const db = mockDb({
      opRows: [
        {
          id: 'a',
          type: 'STOCK_OUT',
          productId: 'm1',
          quantity: 5,
          warehouseId: 'wh1',
          batchNo: null,
          docNo: 'LL1',
          operator: 'A',
          timestamp: new Date('2026-01-02T00:00:00Z'),
        },
      ],
    });
    const res = await listDevMaterialRecords(db, 'style1');
    expect(res.canIssue).toBe(true);
    expect(res.bomProductIds).toEqual(['m1']);
    expect(res.summary[0]).toMatchObject({ productId: 'm1', issuedQty: 5, netQty: 5 });
    expect(res.returnable[0]).toMatchObject({ productId: 'm1', warehouseId: 'wh1', returnableQty: 5 });
    expect(res.docs[0].docNo).toBe('LL1');
  });

  it('counts material records for delete guard', async () => {
    const db = mockDb({
      opRows: [{ id: 'a' }],
    });
    await expect(countDevMaterialRecords(db, 'style1')).resolves.toBe(1);
  });
});
