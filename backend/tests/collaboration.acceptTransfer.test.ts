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
            },
          ],
        }),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx as never));

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
});
