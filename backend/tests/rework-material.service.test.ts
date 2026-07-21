import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../src/middleware/errorHandler.js';
import { PROD_OP_REASON_FROM_REWORK } from '../../shared/types.js';

const createRecordBatch = vi.fn();

vi.mock('../src/services/production.service.js', () => ({
  createRecordBatch: (...args: unknown[]) => createRecordBatch(...args),
}));

import {
  createReworkMaterialIssueBatch,
  createReworkMaterialReturnBatch,
  listReworkMaterialRecords,
} from '../src/services/rework-material.service.js';

function mockDb(opts: {
  orderExists?: boolean;
  opRows?: Array<Record<string, unknown>>;
}) {
  const orderExists = opts.orderExists ?? true;
  const opRows = opts.opRows ?? [];
  return {
    productionOrder: {
      findUnique: vi.fn(async () =>
        orderExists ? { id: 'order1', orderNumber: 'GD001' } : null,
      ),
    },
    productionOpRecord: {
      findMany: vi.fn(async () => opRows),
    },
    product: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        (where.id.in || []).map((id) => ({ id, name: `P-${id}`, sku: id })),
      ),
    },
  } as unknown as import('../src/lib/prisma.js').TenantPrismaClient;
}

function issuedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    type: 'STOCK_OUT',
    productId: 'm1',
    quantity: 5,
    warehouseId: 'wh1',
    batchNo: null,
    docNo: 'LL001',
    operator: '张三',
    timestamp: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('rework-material.service', () => {
  beforeEach(() => {
    createRecordBatch.mockReset();
    createRecordBatch.mockResolvedValue({
      records: [{ id: 'r-new', docNo: 'TL20260101001' }],
      dispatchCompletionPending: [],
    });
  });

  it('rejects when order does not exist', async () => {
    const db = mockDb({ orderExists: false });
    await expect(listReworkMaterialRecords(db, 'order-missing')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('aggregates summary / returnable / docs', async () => {
    const db = mockDb({
      opRows: [
        issuedRow(),
        issuedRow({ id: 'r2', type: 'STOCK_RETURN', quantity: 2, docNo: 'TL001' }),
      ],
    });
    const result = await listReworkMaterialRecords(db, 'order1');
    expect(result.summary).toEqual([
      expect.objectContaining({ productId: 'm1', issuedQty: 5, returnedQty: 2, netQty: 3 }),
    ]);
    expect(result.returnable).toEqual([
      expect.objectContaining({ productId: 'm1', warehouseId: 'wh1', returnableQty: 3 }),
    ]);
    expect(result.docs.map((d) => d.docNo).sort()).toEqual(['LL001', 'TL001']);
    expect(result.canReturn).toBe(true);
  });

  it('writes trusted STOCK_OUT payload for issue', async () => {
    const db = mockDb({});
    await createReworkMaterialIssueBatch(db, 'tenant1', 'order1', {
      lines: [{ productId: 'm1', quantity: 3, warehouseId: 'wh1' }],
      operator: '李四',
    });
    expect(createRecordBatch).toHaveBeenCalledTimes(1);
    const [, records] = createRecordBatch.mock.calls[0] as [unknown, Array<Record<string, unknown>>];
    expect(records[0]).toMatchObject({
      type: 'STOCK_OUT',
      productId: 'm1',
      quantity: 3,
      warehouseId: 'wh1',
      orderId: 'order1',
      partner: null,
      reason: PROD_OP_REASON_FROM_REWORK,
      status: '已完成',
    });
  });

  it('rejects return exceeding returnable quantity', async () => {
    const db = mockDb({
      opRows: [issuedRow({ quantity: 2 })],
    });
    await expect(
      createReworkMaterialReturnBatch(db, 'tenant1', 'order1', {
        lines: [{ productId: 'm1', quantity: 5, warehouseId: 'wh1' }],
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(createRecordBatch).not.toHaveBeenCalled();
  });

  it('accepts return within returnable and writes STOCK_RETURN payload', async () => {
    const db = mockDb({
      opRows: [issuedRow({ quantity: 4 })],
    });
    const result = await createReworkMaterialReturnBatch(db, 'tenant1', 'order1', {
      lines: [{ productId: 'm1', quantity: 3, warehouseId: 'wh1' }],
    });
    const [, records] = createRecordBatch.mock.calls[0] as [unknown, Array<Record<string, unknown>>];
    expect(records[0]).toMatchObject({
      type: 'STOCK_RETURN',
      productId: 'm1',
      quantity: 3,
      warehouseId: 'wh1',
      orderId: 'order1',
      reason: PROD_OP_REASON_FROM_REWORK,
    });
    expect(result.docNo).toBe('TL20260101001');
  });
});
