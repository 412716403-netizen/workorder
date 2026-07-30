import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../src/middleware/errorHandler.js';
import { DevStyleStatus, PROD_OP_REASON_FROM_DEV } from '../../shared/types.js';

const createRecordBatch = vi.fn();
const validateStockOutBatchOnWrite = vi.fn();
const validateStockReturnBatchOnWrite = vi.fn();

vi.mock('../src/services/production.service.js', () => ({
  createRecordBatch: (...args: unknown[]) => createRecordBatch(...args),
}));

vi.mock('../src/services/productionStockBatchWriteValidation.js', () => ({
  validateStockOutBatchOnWrite: (...args: unknown[]) => validateStockOutBatchOnWrite(...args),
  validateStockReturnBatchOnWrite: (...args: unknown[]) => validateStockReturnBatchOnWrite(...args),
}));

import {
  createDevMaterialIssueBatch,
  createDevMaterialReturnBatch,
  listDevMaterialRecords,
  countDevMaterialRecords,
  updateDevMaterialDoc,
  deleteDevMaterialDoc,
} from '../src/services/dev-material.service.js';

type OpRow = Record<string, unknown>;

function mockDb(opts: {
  styleStatus?: string | null;
  bomProductIds?: string[];
  /** 产品档案 BOM：parentProductId -> child productIds */
  archiveBoms?: Array<{ parentProductId: string; childIds: string[] }>;
  opRows?: OpRow[];
}) {
  const styleStatus = opts.styleStatus === undefined ? DevStyleStatus.DEVELOPING : opts.styleStatus;
  const bomProductIds = opts.bomProductIds ?? ['m1'];
  const archiveBoms = opts.archiveBoms ?? [];
  let opRows = [...(opts.opRows ?? [])];

  const productionOpRecord = {
    findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
      const where = args?.where ?? {};
      let rows = opRows;
      if (where.docNo) {
        rows = rows.filter((r) => r.docNo === where.docNo);
      }
      return rows.map((r) => ({ ...r }));
    }),
    count: vi.fn(async () => opRows.length),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const idx = opRows.findIndex((r) => r.id === where.id);
      if (idx < 0) throw new Error(`missing ${where.id}`);
      opRows[idx] = { ...opRows[idx], ...data };
      return opRows[idx];
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; docNo?: string } }) => {
      const before = opRows.length;
      if (where.id?.in) {
        const ids = new Set(where.id.in);
        opRows = opRows.filter((r) => !ids.has(String(r.id)));
      } else if (where.docNo) {
        opRows = opRows.filter((r) => r.docNo !== where.docNo);
      }
      return { count: before - opRows.length };
    }),
  };

  const db = {
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
    bom: {
      findMany: vi.fn(async ({ where }: { where: { parentProductId: { in: string[] } } }) => {
        const parents = new Set(where.parentProductId.in ?? []);
        return archiveBoms
          .filter((b) => parents.has(b.parentProductId))
          .map((b) => ({
            parentProductId: b.parentProductId,
            items: b.childIds.map((productId) => ({ productId })),
          }));
      }),
    },
    productionOpRecord,
    product: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        (where.id.in || []).map((id) => ({ id, name: `P-${id}`, sku: id })),
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    _getOpRows: () => opRows,
  };
  return db as unknown as import('../src/lib/prisma.js').TenantPrismaClient & {
    _getOpRows: () => OpRow[];
    productionOpRecord: typeof productionOpRecord;
  };
}

const issueRow = (overrides: Partial<OpRow> = {}): OpRow => ({
  id: 'a',
  type: 'STOCK_OUT',
  productId: 'm1',
  quantity: 5,
  warehouseId: 'wh1',
  batchNo: 'B1',
  docNo: 'LL1',
  operator: 'A',
  timestamp: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const returnRow = (overrides: Partial<OpRow> = {}): OpRow => ({
  id: 'b',
  type: 'STOCK_RETURN',
  productId: 'm1',
  quantity: 2,
  warehouseId: 'wh1',
  batchNo: 'B1',
  docNo: 'TL1',
  operator: 'A',
  timestamp: new Date('2026-01-02T00:00:00Z'),
  ...overrides,
});

describe('dev-material.service', () => {
  beforeEach(() => {
    createRecordBatch.mockReset();
    createRecordBatch.mockResolvedValue({
      records: [{ id: 'r1', docNo: 'LL20260101001' }],
      dispatchCompletionPending: [],
    });
    validateStockOutBatchOnWrite.mockReset();
    validateStockOutBatchOnWrite.mockResolvedValue(undefined);
    validateStockReturnBatchOnWrite.mockReset();
    validateStockReturnBatchOnWrite.mockResolvedValue(undefined);
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

  it('allows issue for archive-BOM child under试制 BOM material', async () => {
    const db = mockDb({
      bomProductIds: ['m1'],
      archiveBoms: [{ parentProductId: 'm1', childIds: ['c1'] }],
    });
    const result = await createDevMaterialIssueBatch(db, 'tenant1', 'style1', {
      lines: [{ productId: 'c1', quantity: 3, warehouseId: 'wh1' }],
    });
    expect(result.docNo).toBe('LL20260101001');
    expect(createRecordBatch).toHaveBeenCalledTimes(1);
    const [, records] = createRecordBatch.mock.calls[0];
    expect(records[0]).toMatchObject({
      type: 'STOCK_OUT',
      productId: 'c1',
      quantity: 3,
      reason: PROD_OP_REASON_FROM_DEV,
      customData: { devStyleId: 'style1' },
    });
  });

  it('still rejects unrelated material even when archive BOM exists', async () => {
    const db = mockDb({
      bomProductIds: ['m1'],
      archiveBoms: [{ parentProductId: 'm1', childIds: ['c1'] }],
    });
    await expect(
      createDevMaterialIssueBatch(db, 'tenant1', 'style1', {
        lines: [{ productId: 'm9', quantity: 1, warehouseId: 'wh1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
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
      opRows: [issueRow(), returnRow()],
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
        issueRow({
          batchNo: null,
          timestamp: new Date('2026-01-02T00:00:00Z'),
        }),
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

  it('rejects update when style is archived', async () => {
    const db = mockDb({
      styleStatus: DevStyleStatus.ARCHIVED,
      opRows: [issueRow()],
    });
    await expect(
      updateDevMaterialDoc(db, 'style1', 'LL1', {
        lines: [{ id: 'a', quantity: 3, warehouseId: 'wh1', batchNo: 'B1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects delete when style is archived', async () => {
    const db = mockDb({
      styleStatus: DevStyleStatus.ARCHIVED,
      opRows: [issueRow()],
    });
    await expect(deleteDevMaterialDoc(db, 'style1', 'LL1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('updates quantity successfully', async () => {
    const db = mockDb({ opRows: [issueRow()] });
    const result = await updateDevMaterialDoc(db, 'style1', 'LL1', {
      lines: [{ id: 'a', quantity: 3, warehouseId: 'wh1', batchNo: 'B1' }],
      operator: '李四',
    });
    expect(result).toMatchObject({
      docNo: 'LL1',
      type: 'STOCK_OUT',
      updatedIds: ['a'],
      deletedIds: [],
    });
    expect(db.productionOpRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a' },
        data: expect.objectContaining({ quantity: 3, operator: '李四' }),
      }),
    );
    expect(validateStockOutBatchOnWrite).toHaveBeenCalled();
  });

  it('deletes a line from the doc', async () => {
    const db = mockDb({
      opRows: [
        issueRow({ id: 'a', quantity: 3 }),
        issueRow({ id: 'c', quantity: 2, productId: 'm2', batchNo: null }),
      ],
    });
    const result = await updateDevMaterialDoc(db, 'style1', 'LL1', {
      lines: [{ id: 'a', quantity: 3, warehouseId: 'wh1', batchNo: 'B1' }],
    });
    expect(result.deletedIds).toEqual(['c']);
    expect(result.updatedIds).toEqual(['a']);
    expect(db.productionOpRecord.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['c'] } },
    });
  });

  it('deletes whole doc successfully', async () => {
    const db = mockDb({ opRows: [issueRow()] });
    const result = await deleteDevMaterialDoc(db, 'style1', 'LL1');
    expect(result).toMatchObject({
      docNo: 'LL1',
      type: 'STOCK_OUT',
      updatedIds: [],
      deletedIds: ['a'],
    });
    expect(db._getOpRows()).toHaveLength(0);
  });

  it('rejects issue qty decrease that makes returned exceed issued', async () => {
    const db = mockDb({
      opRows: [issueRow({ quantity: 5 }), returnRow({ quantity: 3 })],
    });
    await expect(
      updateDevMaterialDoc(db, 'style1', 'LL1', {
        lines: [{ id: 'a', quantity: 2, warehouseId: 'wh1', batchNo: 'B1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects deleting issue doc when return still exists', async () => {
    const db = mockDb({
      opRows: [issueRow({ quantity: 5 }), returnRow({ quantity: 2 })],
    });
    await expect(deleteDevMaterialDoc(db, 'style1', 'LL1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects update for unknown docNo', async () => {
    const db = mockDb({ opRows: [issueRow()] });
    await expect(
      updateDevMaterialDoc(db, 'style1', 'LL-MISSING', {
        lines: [{ id: 'a', quantity: 3, warehouseId: 'wh1', batchNo: 'B1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
