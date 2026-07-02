import { describe, expect, it, vi } from 'vitest';
import { updatePlan } from '../src/services/plans.service.js';
import { AppError } from '../src/middleware/errorHandler.js';

describe('updatePlan milestoneNodeIds validation', () => {
  const planId = 'plan-1';

  function mockDb(overrides: {
    existing?: Record<string, unknown>;
    orderCount?: number;
  } = {}) {
    const existing = {
      id: planId,
      milestoneNodeIds: null,
      ...overrides.existing,
    };
    return {
      planOrder: {
        findUnique: vi.fn().mockResolvedValue(existing),
      },
      productionOrder: {
        count: vi.fn().mockResolvedValue(overrides.orderCount ?? 0),
      },
    };
  }

  it('rejects empty milestone route array', async () => {
    const db = mockDb();
    await expect(
      updatePlan(db as never, planId, { milestoneNodeIds: [] }),
    ).rejects.toMatchObject({ statusCode: 400, message: '工序路线不能为空' });
  });

  it('rejects route change when production orders exist', async () => {
    const db = mockDb({
      existing: { milestoneNodeIds: ['n1'] },
      orderCount: 1,
    });
    await expect(
      updatePlan(db as never, planId, { milestoneNodeIds: ['n1', 'n2'] }),
    ).rejects.toMatchObject({ statusCode: 400, message: '已下达工单的计划单不可修改工序路线' });
  });

  it('rejects route change when clearing override with linked orders', async () => {
    const db = mockDb({
      existing: { milestoneNodeIds: ['n1'] },
      orderCount: 2,
    });
    await expect(
      updatePlan(db as never, planId, { milestoneNodeIds: null }),
    ).rejects.toMatchObject({ statusCode: 400, message: '已下达工单的计划单不可修改工序路线' });
  });
});

describe('getEffectivePlanMilestoneNodeIds (shared)', () => {
  it('prefers plan override for convert semantics', async () => {
    const { getEffectivePlanMilestoneNodeIds } = await import('../../../shared/planMilestoneRoute.js');
    expect(
      getEffectivePlanMilestoneNodeIds(
        { milestoneNodeIds: ['plan-a', 'plan-b'] },
        { milestoneNodeIds: ['prod-a'] },
      ),
    ).toEqual(['plan-a', 'plan-b']);
  });
});
