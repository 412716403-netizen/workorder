import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DevStyleStatus } from '../../shared/types.js';

const syncPublishedProductFromDevStyle = vi.fn();

vi.mock('../src/services/dev-published-sync.service.js', () => ({
  syncPublishedProductFromDevStyle: (...args: unknown[]) => syncPublishedProductFromDevStyle(...args),
}));

import { updateDevStyle } from '../src/services/dev-styles.service.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function styleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'style1',
    code: 'D001',
    name: '产品编号A',
    customerName: null,
    imageUrl: null,
    imageThumb: null,
    categoryId: 'cat1',
    categoryCustomData: {},
    colorIds: [],
    sizeIds: [],
    milestoneNodeIds: [],
    defaultStageNames: [],
    salesPrice: null,
    purchasePrice: null,
    unitId: null,
    supplierId: null,
    status: DevStyleStatus.DEVELOPING,
    publishedProductId: null,
    createdAt: NOW,
    updatedAt: NOW,
    variants: [],
    samples: [],
    ...overrides,
  };
}

function mockDb(existing: Record<string, unknown>) {
  const devStyleUpdate = vi.fn(async () => styleRow(existing));
  const db = {
    devStyle: {
      findUnique: vi.fn(async () => styleRow(existing)),
      findFirst: vi.fn(async () => null),
      update: devStyleUpdate,
    },
    product: {
      findFirst: vi.fn(async () => null),
    },
    devStyleVariant: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(db)),
  };
  return { db: db as unknown as import('../src/lib/prisma.js').TenantPrismaClient, devStyleUpdate };
}

describe('updateDevStyle → 已生成商品回写产品档案', () => {
  beforeEach(() => {
    syncPublishedProductFromDevStyle.mockReset();
    syncPublishedProductFromDevStyle.mockResolvedValue(undefined);
  });

  it('syncs the published product after style save (含色码/工序/BOM)', async () => {
    const { db } = mockDb({ publishedProductId: 'prod1' });
    await updateDevStyle(db, 'tenant1', 'style1', {
      name: '新产品编号',
      code: 'D002',
      salesPrice: 12.5,
      colorIds: ['c1'],
      sizeIds: ['s1'],
      milestoneNodeIds: ['n1'],
      variants: [{ id: 'dv1', colorId: 'c1', sizeId: 's1' }],
    });
    expect(syncPublishedProductFromDevStyle).toHaveBeenCalledWith(
      db,
      'tenant1',
      'style1',
      'prod1',
    );
  });

  it('still writes style variants when the style was published before', async () => {
    const { db, devStyleUpdate } = mockDb({ publishedProductId: 'prod1' });
    await updateDevStyle(db, 'tenant1', 'style1', {
      name: '编号A',
      variants: [{ id: 'dv1', colorId: 'c1', sizeId: 's1', skuSuffix: '', nodeBoms: {} }],
    });
    expect(devStyleUpdate).toHaveBeenCalled();
    expect(db.devStyleVariant.createMany).toHaveBeenCalled();
    expect(syncPublishedProductFromDevStyle).toHaveBeenCalled();
  });

  it('still syncs the product when archiving a previously published style back to published', async () => {
    const { db } = mockDb({ publishedProductId: 'prod1' });
    await updateDevStyle(db, 'tenant1', 'style1', { status: DevStyleStatus.ARCHIVED });
    expect(syncPublishedProductFromDevStyle).toHaveBeenCalledWith(
      db,
      'tenant1',
      'style1',
      'prod1',
    );
  });

  it('leaves the style saved even if product sync is rejected on a later retry path', async () => {
    const { db, devStyleUpdate } = mockDb({ publishedProductId: 'prod1' });
    syncPublishedProductFromDevStyle.mockRejectedValue(new Error('产品编号已存在'));
    await expect(
      updateDevStyle(db, 'tenant1', 'style1', { name: '撞号的编号' }),
    ).rejects.toThrow('产品编号已存在');
    // 款式已先落库
    expect(devStyleUpdate).toHaveBeenCalled();
  });

  it('does not sync for styles that were never published', async () => {
    const { db } = mockDb({ publishedProductId: null });
    await updateDevStyle(db, 'tenant1', 'style1', { name: '产品编号B' });
    expect(syncPublishedProductFromDevStyle).not.toHaveBeenCalled();
  });
});

describe('updateDevStyle → published 状态只接受还原', () => {
  beforeEach(() => {
    syncPublishedProductFromDevStyle.mockReset();
    syncPublishedProductFromDevStyle.mockResolvedValue(undefined);
  });

  it('rejects field edits while published', async () => {
    const { db } = mockDb({
      status: DevStyleStatus.PUBLISHED,
      publishedProductId: 'prod1',
    });
    await expect(
      updateDevStyle(db, 'tenant1', 'style1', { name: '改个名' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(syncPublishedProductFromDevStyle).not.toHaveBeenCalled();
  });

  it('allows restoring to developing without syncing the product', async () => {
    const { db, devStyleUpdate } = mockDb({
      status: DevStyleStatus.PUBLISHED,
      publishedProductId: 'prod1',
    });
    await updateDevStyle(db, 'tenant1', 'style1', {
      status: DevStyleStatus.DEVELOPING,
      name: '顺带发过来的名字',
    });
    expect(devStyleUpdate).toHaveBeenCalledWith({
      where: { id: 'style1' },
      data: { status: DevStyleStatus.DEVELOPING },
    });
    expect(syncPublishedProductFromDevStyle).not.toHaveBeenCalled();
  });
});
