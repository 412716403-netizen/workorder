/**
 * scanValidate.service 行为单测：纯函数 + Prisma mock，验证
 *   - 各 purpose 的去重 SQL where 形状（不打真实 DB）；
 *   - max 校验在 currentQty + addQty > maxQty 时触发；
 *   - assertScanNotAlreadyUsed 在命中重复时抛 AppError(409)。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  findFirstMilestoneReport,
  findFirstProductProgressReport,
  findManyProductMilestoneProgress,
  findFirstProductionOpRecord,
  findManyItemCode,
} = vi.hoisted(() => ({
  findFirstMilestoneReport: vi.fn(),
  findFirstProductProgressReport: vi.fn(),
  findManyProductMilestoneProgress: vi.fn(),
  findFirstProductionOpRecord: vi.fn(),
  findManyItemCode: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    milestoneReport: { findFirst: findFirstMilestoneReport },
    productProgressReport: { findFirst: findFirstProductProgressReport },
    productMilestoneProgress: { findMany: findManyProductMilestoneProgress },
    productionOpRecord: { findFirst: findFirstProductionOpRecord },
    itemCode: { findMany: findManyItemCode },
  },
}));

import {
  validateScanUsage,
  assertScanNotAlreadyUsed,
} from '../src/services/scanValidate.service.js';

const TENANT = 'tenant-1';

beforeEach(() => {
  findFirstMilestoneReport.mockReset();
  findFirstProductProgressReport.mockReset();
  findManyProductMilestoneProgress.mockReset();
  findFirstProductionOpRecord.mockReset();
  findManyItemCode.mockReset();
  // 默认无关联单品；具体用例覆盖以验证 batch→items 反向并入逻辑
  findManyItemCode.mockResolvedValue([]);
});

describe('validateScanUsage', () => {
  it('returns ALLOWED when no duplicate and no maxQty exceeded', async () => {
    findFirstMilestoneReport.mockResolvedValueOnce(null);
    const r = await validateScanUsage(TENANT, {
      purpose: 'MILESTONE_REPORT',
      scope: { milestoneId: 'm1' },
      itemCodeId: 'ic1',
      virtualBatchId: null,
      currentQty: 1,
      addQty: 1,
      maxQty: 10,
    });
    expect(r.code).toBe('ALLOWED');
    expect(findFirstMilestoneReport).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          milestoneId: 'm1',
          milestone: { productionOrder: { tenantId: TENANT } },
          OR: [{ itemCodeId: 'ic1' }],
        }),
      }),
    );
  });

  it('returns DUPLICATE_SAVED when a milestone report already used the itemCodeId', async () => {
    findFirstMilestoneReport.mockResolvedValueOnce({ id: 'rpt-1' });
    const r = await validateScanUsage(TENANT, {
      purpose: 'MILESTONE_REPORT',
      scope: { milestoneId: 'm1' },
      itemCodeId: 'ic1',
    });
    expect(r.code).toBe('DUPLICATE_SAVED');
    expect(r.message).toMatch(/已报工/);
  });

  it('returns EXCEEDS_MAX with remaining and message when current+add > max', async () => {
    findFirstMilestoneReport.mockResolvedValueOnce(null);
    const r = await validateScanUsage(TENANT, {
      purpose: 'MILESTONE_REPORT',
      scope: { milestoneId: 'm1' },
      itemCodeId: 'ic1',
      currentQty: 9,
      addQty: 2,
      maxQty: 10,
    });
    expect(r.code).toBe('EXCEEDS_MAX');
    expect(r.remaining).toBe(1);
    expect(r.message).toMatch(/超过/);
  });

  it('skips max check when maxQty is missing or non-finite', async () => {
    findFirstMilestoneReport.mockResolvedValueOnce(null);
    const r = await validateScanUsage(TENANT, {
      purpose: 'MILESTONE_REPORT',
      scope: { milestoneId: 'm1' },
      itemCodeId: 'ic1',
      currentQty: 100,
      addQty: 100,
    });
    expect(r.code).toBe('ALLOWED');
  });

  it('returns ALLOWED for empty ids without querying DB', async () => {
    const r = await validateScanUsage(TENANT, {
      purpose: 'MILESTONE_REPORT',
      scope: { milestoneId: 'm1' },
      itemCodeId: null,
      virtualBatchId: null,
    });
    expect(r.code).toBe('ALLOWED');
    expect(findFirstMilestoneReport).not.toHaveBeenCalled();
  });

  it('PRODUCT_REPORT joins through ProductMilestoneProgress for variant scope', async () => {
    findManyProductMilestoneProgress.mockResolvedValueOnce([{ id: 'pmp-1' }, { id: 'pmp-2' }]);
    findFirstProductProgressReport.mockResolvedValueOnce(null);
    const r = await validateScanUsage(TENANT, {
      purpose: 'PRODUCT_REPORT',
      scope: { productId: 'p1', milestoneTemplateId: 't1', variantId: 'v1' },
      virtualBatchId: 'vb1',
    });
    expect(r.code).toBe('ALLOWED');
    expect(findManyProductMilestoneProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          productId: 'p1',
          milestoneTemplateId: 't1',
          variantId: 'v1',
        }),
      }),
    );
    expect(findFirstProductProgressReport).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          progressId: { in: ['pmp-1', 'pmp-2'] },
          OR: [{ virtualBatchId: 'vb1' }],
        }),
      }),
    );
  });

  it('STOCK_IN dedupes by orderIds across the merged pending row', async () => {
    findFirstProductionOpRecord.mockResolvedValueOnce({ id: 'rec-1' });
    const r = await validateScanUsage(TENANT, {
      purpose: 'STOCK_IN',
      scope: { orderIds: ['o1', 'o2'] },
      virtualBatchId: 'vb1',
    });
    expect(r.code).toBe('DUPLICATE_SAVED');
    expect(findFirstProductionOpRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          type: 'STOCK_IN',
          orderId: { in: ['o1', 'o2'] },
        }),
      }),
    );
  });

  it('scanning a batch also ORs in itemCodeId IN (children of batch) to catch legacy item records', async () => {
    // 模拟该批次包含 2 个单品；这些单品已被早先报工命中，应判 DUPLICATE_SAVED
    findManyItemCode.mockResolvedValueOnce([{ id: 'child-ic-1' }, { id: 'child-ic-2' }]);
    findFirstMilestoneReport.mockResolvedValueOnce({ id: 'rpt-legacy' });
    const r = await validateScanUsage(TENANT, {
      purpose: 'MILESTONE_REPORT',
      scope: { milestoneId: 'm1' },
      itemCodeId: null,
      virtualBatchId: 'vb-parent',
    });
    expect(r.code).toBe('DUPLICATE_SAVED');
    expect(findManyItemCode).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, batchId: 'vb-parent' },
      }),
    );
    expect(findFirstMilestoneReport).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { virtualBatchId: 'vb-parent' },
            { itemCodeId: { in: ['child-ic-1', 'child-ic-2'] } },
          ]),
        }),
      }),
    );
  });

  it('OUTSOURCE_RECEIVE filters by status 已收回 and excludes rework receipts', async () => {
    findFirstProductionOpRecord.mockResolvedValueOnce(null);
    const r = await validateScanUsage(TENANT, {
      purpose: 'OUTSOURCE_RECEIVE',
      scope: { orderId: 'o1', productId: 'p1', partner: 'A' },
      itemCodeId: 'ic1',
    });
    expect(r.code).toBe('ALLOWED');
    expect(findFirstProductionOpRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          type: 'OUTSOURCE',
          status: '已收回',
          sourceReworkId: null,
          partner: 'A',
        }),
      }),
    );
  });
});

describe('assertScanNotAlreadyUsed', () => {
  it('throws AppError(409) when duplicate found', async () => {
    findFirstProductionOpRecord.mockResolvedValueOnce({ id: 'rec-1' });
    await expect(
      assertScanNotAlreadyUsed(
        TENANT,
        'STOCK_IN',
        { orderId: 'o1' },
        { itemCodeId: 'ic1', virtualBatchId: null },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('is a no-op when no ids provided', async () => {
    await expect(
      assertScanNotAlreadyUsed(
        TENANT,
        'STOCK_IN',
        { orderId: 'o1' },
        { itemCodeId: null, virtualBatchId: null },
      ),
    ).resolves.toBeUndefined();
    expect(findFirstProductionOpRecord).not.toHaveBeenCalled();
  });
});
