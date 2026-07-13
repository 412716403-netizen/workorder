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
    const { getEffectivePlanMilestoneNodeIds } = await import('../../shared/planMilestoneRoute.js');
    expect(
      getEffectivePlanMilestoneNodeIds(
        { milestoneNodeIds: ['plan-a', 'plan-b'] },
        { milestoneNodeIds: ['prod-a'] },
      ),
    ).toEqual(['plan-a', 'plan-b']);
  });
});

describe('convertPlanToOrders empty route', () => {
  it('rejects when effective milestone route is empty', async () => {
    const { convertPlanToOrders } = await import('../src/services/plans.service.js');
    const { prisma } = await import('../src/lib/prisma.js');

    const plan = {
      id: 'plan-empty',
      tenantId: 't1',
      planNumber: 'PLN99',
      productId: 'prod-1',
      status: 'APPROVED',
      milestoneNodeIds: null,
      parentPlanId: null,
      bomNodeId: null,
      customer: null,
      startDate: null,
      dueDate: null,
      priority: 'Medium',
      items: [{ variantId: null, quantity: 1 }],
    };

    vi.spyOn(prisma.planOrder, 'findUnique').mockResolvedValue(plan as never);
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({
      id: 'prod-1',
      milestoneNodeIds: [],
      name: 'P',
      sku: 'S',
    } as never);
    vi.spyOn(prisma.planOrder, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.productionOrder, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.globalNodeTemplate, 'findMany').mockResolvedValue([]);

    await expect(convertPlanToOrders(prisma as never, 't1', 'plan-empty')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('尚未配置工序路线'),
    });
  });
});
