import { describe, it, expect, vi, afterEach } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { acceptTransfer, getOriginChainDispatchCategoryName } from '../src/services/collaboration.service.js';

describe('getOriginChainDispatchCategoryName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns first trimmed categoryName from earliest dispatch payloads', async () => {
    vi.spyOn(prisma.interTenantSubcontractTransfer, 'findUnique').mockResolvedValue({
      dispatches: [
        { payload: { categoryName: '   ' }, createdAt: new Date('2020-01-01') },
        { payload: { categoryName: '  链头分类  ' }, createdAt: new Date('2020-01-02') },
      ],
    } as never);
    await expect(getOriginChainDispatchCategoryName('origin-1')).resolves.toBe('链头分类');
  });

  it('returns null when no usable categoryName', async () => {
    vi.spyOn(prisma.interTenantSubcontractTransfer, 'findUnique').mockResolvedValue({
      dispatches: [{ payload: {} }],
    } as never);
    await expect(getOriginChainDispatchCategoryName('origin-2')).resolves.toBeNull();
  });
});

describe('acceptTransfer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when createProduct is present but categoryDecision is missing', async () => {
    const tx = {
      interTenantSubcontractTransfer: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'tr1',
          receiverTenantId: 'trecv',
          senderTenantId: 'tsend',
          collaborationId: null,
          senderProductSku: 'SK1',
          senderProductId: null,
          receiverProductId: null,
          bReceiveMode: 'order',
          dispatches: [
            {
              id: 'd1',
              status: 'PENDING',
              payload: { items: [] },
              receiverProductionOrderId: null,
              receiverPlanOrderId: null,
            },
          ],
        }),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn) => fn(tx as never));

    await expect(
      acceptTransfer('trecv', 'tr1', {
        dispatchIds: ['d1'],
        createProduct: { name: 'N', sku: 'S' } as never,
      }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      acceptTransfer('trecv', 'tr1', {
        dispatchIds: ['d1'],
        createProduct: { name: 'N', sku: 'S' } as never,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates PlanOrder (not ProductionOrder) and writes receiverPlanOrderId', async () => {
    const planCreate = vi.fn().mockResolvedValue({});
    const planItemCreate = vi.fn().mockResolvedValue({});
    const dispatchUpdate = vi.fn().mockResolvedValue({});
    const productionOrderCreate = vi.fn();
    const orderItemCreate = vi.fn();

    const tx = {
      interTenantSubcontractTransfer: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'tr1',
          receiverTenantId: 'trecv',
          senderTenantId: 'tsend',
          collaborationId: null,
          senderProductSku: 'SK1',
          senderProductName: 'P1',
          senderProductId: null,
          receiverProductId: 'prod-1',
          bReceiveMode: 'order',
          dispatches: [
            {
              id: 'd1',
              status: 'PENDING',
              payload: { items: [{ quantity: 2, colorName: null, sizeName: null }] },
              receiverProductionOrderId: null,
              receiverPlanOrderId: null,
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prod-1',
          name: 'P1',
          sku: 'SK1',
          milestoneNodeIds: [],
          category: null,
        }),
      },
      planOrder: {
        create: planCreate,
        findMany: vi.fn().mockResolvedValue([]),
      },
      planItem: {
        create: planItemCreate,
      },
      productionOrder: {
        create: productionOrderCreate,
        findMany: vi.fn().mockResolvedValue([]),
      },
      orderItem: {
        create: orderItemCreate,
      },
      dictionaryItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      productVariant: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      subcontractCollaborationDispatch: {
        update: dispatchUpdate,
      },
      collaborationProductMap: {
        upsert: vi.fn(),
      },
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn) => fn(tx as never));

    const res = await acceptTransfer('trecv', 'tr1', { dispatchIds: ['d1'] });

    expect(planCreate).toHaveBeenCalled();
    expect(productionOrderCreate).not.toHaveBeenCalled();
    expect(orderItemCreate).not.toHaveBeenCalled();
    expect(dispatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACCEPTED',
          receiverPlanOrderId: expect.any(String),
        }),
      }),
    );
    expect(res.createdPlans?.length).toBe(1);
    expect(res.createdOrders).toEqual([]);
    expect(res.pendingProcess).toBe(true);
    expect(res.receiverPlanIds?.[0]).toBe(res.createdPlans?.[0]);
  });
});
