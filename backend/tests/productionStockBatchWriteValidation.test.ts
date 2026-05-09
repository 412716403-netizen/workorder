import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as psiService from '../src/services/psi.service.js';
import {
  validateStockReturnBatchOnWrite,
  validateStockOutBatchOnWrite,
} from '../src/services/productionStockBatchWriteValidation.js';
import { BATCH_NO_UNTAGGED } from '../../shared/types.js';

vi.mock('../src/services/psi.service.js', () => ({
  getStockBatches: vi.fn(),
}));

const batchCat = { hasBatchManagement: true, hasColorSize: false };

function mockDb(category: typeof batchCat | null) {
  return {
    product: {
      findUnique: vi.fn(async () => ({ categoryId: 'c1' })),
    },
    productCategory: {
      findUnique: vi.fn(async () => category),
    },
  } as unknown as import('../src/lib/prisma.js').TenantPrismaClient;
}

describe('productionStockBatchWriteValidation', () => {
  beforeEach(() => {
    vi.mocked(psiService.getStockBatches).mockReset();
  });

  describe('validateStockReturnBatchOnWrite', () => {
    it('throws when batch category requires batch but batchNo empty', async () => {
      const db = mockDb(batchCat);
      const data: Record<string, unknown> = {
        type: 'STOCK_RETURN',
        productId: 'p1',
        warehouseId: 'w1',
        batchNo: '',
      };
      await expect(validateStockReturnBatchOnWrite(db, data)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('退料必须'),
      });
    });

    it('normalizes batch when category uses batch', async () => {
      const db = mockDb(batchCat);
      const data: Record<string, unknown> = {
        type: 'STOCK_RETURN',
        productId: 'p1',
        warehouseId: 'w1',
        batchNo: '  B1  ',
      };
      await validateStockReturnBatchOnWrite(db, data);
      expect(data.batchNo).toBe('B1');
    });

    it('no-op when type is not STOCK_RETURN', async () => {
      const db = mockDb(batchCat);
      const data: Record<string, unknown> = { type: 'STOCK_OUT', productId: 'p1', warehouseId: 'w1' };
      await validateStockReturnBatchOnWrite(db, data);
      expect(db.product.findUnique).not.toHaveBeenCalled();
    });

    it('accepts BATCH_NO_UNTAGGED sentinel and writes NULL', async () => {
      const db = mockDb(batchCat);
      const data: Record<string, unknown> = {
        type: 'STOCK_RETURN',
        productId: 'p1',
        warehouseId: 'w1',
        batchNo: BATCH_NO_UNTAGGED,
      };
      await validateStockReturnBatchOnWrite(db, data);
      expect('batchNo' in data).toBe(false);
    });
  });

  describe('validateStockOutBatchOnWrite', () => {
    it('throws when qty exceeds batch available', async () => {
      vi.mocked(psiService.getStockBatches).mockResolvedValue([{ batchNo: 'B1', stock: 3 }]);
      const db = mockDb(batchCat);
      const data: Record<string, unknown> = {
        type: 'STOCK_OUT',
        productId: 'p1',
        warehouseId: 'w1',
        batchNo: 'B1',
        quantity: 10,
      };
      await expect(validateStockOutBatchOnWrite(db, data)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('可用库存不足'),
      });
    });

    it('passes when qty within available', async () => {
      vi.mocked(psiService.getStockBatches).mockResolvedValue([{ batchNo: 'B1', stock: 100 }]);
      const db = mockDb(batchCat);
      const data: Record<string, unknown> = {
        type: 'STOCK_OUT',
        productId: 'p1',
        warehouseId: 'w1',
        batchNo: 'B1',
        quantity: 5,
      };
      await validateStockOutBatchOnWrite(db, data);
      expect(data.batchNo).toBe('B1');
    });

    it('accepts BATCH_NO_UNTAGGED sentinel and writes NULL with NULL-bucket stock check', async () => {
      vi.mocked(psiService.getStockBatches).mockResolvedValue([
        { batchNo: BATCH_NO_UNTAGGED, stock: 50 },
        { batchNo: 'B1', stock: 100 },
      ]);
      const db = mockDb(batchCat);
      const data: Record<string, unknown> = {
        type: 'STOCK_OUT',
        productId: 'p1',
        warehouseId: 'w1',
        batchNo: BATCH_NO_UNTAGGED,
        quantity: 30,
      };
      await validateStockOutBatchOnWrite(db, data);
      expect('batchNo' in data).toBe(false);
    });

    it('rejects untagged stock-out when NULL-bucket stock insufficient', async () => {
      vi.mocked(psiService.getStockBatches).mockResolvedValue([{ batchNo: BATCH_NO_UNTAGGED, stock: 5 }]);
      const db = mockDb(batchCat);
      const data: Record<string, unknown> = {
        type: 'STOCK_OUT',
        productId: 'p1',
        warehouseId: 'w1',
        batchNo: BATCH_NO_UNTAGGED,
        quantity: 10,
      };
      await expect(validateStockOutBatchOnWrite(db, data)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining(BATCH_NO_UNTAGGED),
      });
    });
  });
});
