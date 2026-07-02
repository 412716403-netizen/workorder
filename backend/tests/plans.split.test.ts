import { describe, expect, it, vi } from 'vitest';
import { pickNextSplitPlanNumber } from '../src/utils/planSplitNumber.js';
import { splitPlan } from '../src/services/plans.service.js';
import { AppError } from '../src/middleware/errorHandler.js';

describe('pickNextSplitPlanNumber', () => {
  it('allocates -1 then -2 for same prefix', () => {
    expect(pickNextSplitPlanNumber('PLN5', [])).toBe('PLN5-1');
    expect(pickNextSplitPlanNumber('PLN5', ['PLN5-1'])).toBe('PLN5-2');
    expect(pickNextSplitPlanNumber('PLN5-1', ['PLN5-1-1'])).toBe('PLN5-1-2');
  });

  it('skips occupied suffixes', () => {
    expect(pickNextSplitPlanNumber('PLN5', ['PLN5-1', 'PLN5-3'])).toBe('PLN5-2');
  });

  it('ignores sub-plan -S suffix and unrelated long suffix', () => {
    expect(pickNextSplitPlanNumber('PLN5', ['PLN5-S1', 'PLN5-100'])).toBe('PLN5-1');
  });
});

describe('splitPlan service validation', () => {
  const tenantId = 'tenant-1';
  const planId = 'plan-src';

  function mockPlan(overrides: Record<string, unknown> = {}) {
    return {
      id: planId,
      tenantId,
      planNumber: 'PLN10',
      parentPlanId: null,
      productId: 'prod-1',
      status: 'APPROVED',
      startDate: null,
      dueDate: null,
      customer: '客户A',
      priority: 'Medium',
      assignments: {},
      customData: {},
      nodePricingModes: null,
      items: [{ id: 1, variantId: null, quantity: 100, planOrderId: planId }],
      productionOrders: [],
      ...overrides,
    };
  }

  it('rejects BOM sub-plans', async () => {
    const db = {
      planOrder: {
        findUnique: vi.fn().mockResolvedValue(mockPlan({ parentPlanId: 'parent-1' })),
      },
    };
    await expect(
      splitPlan(db as never, tenantId, planId, { items: [{ quantity: 10 }] }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'BOM 子计划不可拆单' });
  });

  it('rejects converted plans', async () => {
    const db = {
      planOrder: {
        findUnique: vi.fn().mockResolvedValue(mockPlan({ status: 'CONVERTED' })),
      },
    };
    await expect(
      splitPlan(db as never, tenantId, planId, { items: [{ quantity: 10 }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when linked production orders exist', async () => {
    const db = {
      planOrder: {
        findUnique: vi.fn().mockResolvedValue(mockPlan({ productionOrders: [{ id: 'o1' }] })),
      },
    };
    await expect(
      splitPlan(db as never, tenantId, planId, { items: [{ quantity: 10 }] }),
    ).rejects.toMatchObject({ statusCode: 400, message: '已关联工单的计划单不可拆单' });
  });

  it('rejects split quantity exceeding source', async () => {
    const db = {
      planOrder: {
        findUnique: vi.fn().mockResolvedValue(mockPlan({ items: [{ id: 1, variantId: null, quantity: 10, planOrderId: planId }] })),
      },
    };
    await expect(
      splitPlan(db as never, tenantId, planId, { items: [{ quantity: 11 }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('requires source to retain at least 1 unit', async () => {
    const db = {
      planOrder: {
        findUnique: vi.fn().mockResolvedValue(mockPlan({ items: [{ id: 1, variantId: null, quantity: 5, planOrderId: planId }] })),
      },
    };
    await expect(
      splitPlan(db as never, tenantId, planId, { items: [{ quantity: 5 }] }),
    ).rejects.toMatchObject({ statusCode: 400, message: '拆单后原单须至少保留 1 件，请减少拆出数量' });
  });
});
