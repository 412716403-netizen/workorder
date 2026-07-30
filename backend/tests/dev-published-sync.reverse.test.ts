import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncDevStyleFromPublishedProduct } from '../src/services/dev-published-sync.service.js';

describe('syncDevStyleFromPublishedProduct', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('no-ops when no style is linked to the product', async () => {
    const db = {
      devStyle: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
      product: { findUnique: vi.fn() },
      bom: { findMany: vi.fn() },
      $transaction: vi.fn(),
    };
    await syncDevStyleFromPublishedProduct(db as never, 'prod1');
    expect(db.product.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rewrites style scalars, variants and trial BOMs from the product', async () => {
    const styleUpdate = vi.fn(async () => ({}));
    const variantDelete = vi.fn(async () => ({ count: 1 }));
    const variantCreate = vi.fn(async () => ({ count: 1 }));
    const bomDelete = vi.fn(async () => ({ count: 1 }));
    const bomCreate = vi.fn(async () => ({}));

    const db = {
      devStyle: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'style1',
            tenantId: 'tenant1',
            publishedProductId: 'prod1',
            name: '旧编号',
            variants: [{ id: 'dvar1', colorId: 'c1', sizeId: 's1' }],
          })
          .mockResolvedValueOnce(null), // 品名冲突检查：无其它款式
        update: styleUpdate,
      },
      product: {
        findUnique: vi.fn(async () => ({
          id: 'prod1',
          name: '新编号',
          sku: 'NEW-SKU',
          imageUrl: 'http://img',
          imageThumb: 'thumb',
          categoryId: 'cat1',
          categoryCustomData: { a: 1 },
          colorIds: ['c1', 'c2'],
          sizeIds: ['s1'],
          milestoneNodeIds: ['n1', 'n2'],
          salesPrice: 10,
          purchasePrice: 5,
          unitId: 'u1',
          supplierId: 'p1',
          variants: [
            { id: 'pv1', colorId: 'c1', sizeId: 's1', skuSuffix: '' },
            { id: 'pv2', colorId: 'c2', sizeId: 's1', skuSuffix: 'X' },
          ],
        })),
      },
      bom: {
        findMany: vi.fn(async () => [
          {
            id: 'bom1',
            name: '面料',
            variantId: 'pv1',
            nodeId: 'n1',
            items: [
              {
                categoryId: 'mc1',
                productId: 'mat1',
                quantity: 1.5,
                note: null,
                useShortageOnly: false,
                excludeFromWeightShare: false,
                sortOrder: 0,
              },
            ],
          },
        ]),
      },
      devStyleVariant: {
        deleteMany: variantDelete,
        createMany: variantCreate,
      },
      devBom: {
        deleteMany: bomDelete,
        create: bomCreate,
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(db)),
    };

    await syncDevStyleFromPublishedProduct(db as never, 'prod1');

    expect(styleUpdate).toHaveBeenCalledWith({
      where: { id: 'style1' },
      data: expect.objectContaining({
        name: '新编号',
        code: 'NEW-SKU',
        colorIds: ['c1', 'c2'],
        sizeIds: ['s1'],
        milestoneNodeIds: ['n1', 'n2'],
        imageUrl: 'http://img',
        categoryId: 'cat1',
      }),
    });
    expect(variantDelete).toHaveBeenCalledWith({ where: { styleId: 'style1' } });
    expect(variantCreate).toHaveBeenCalled();
    const createdVariants = variantCreate.mock.calls[0][0].data as Array<{
      id: string;
      colorId: string | null;
      sizeId: string | null;
      nodeBoms: Record<string, string>;
    }>;
    expect(createdVariants).toHaveLength(2);
    expect(createdVariants.find((v) => v.colorId === 'c1' && v.sizeId === 's1')?.id).toBe('dvar1');
    expect(bomDelete).toHaveBeenCalledWith({ where: { parentStyleId: 'style1' } });
    expect(bomCreate).toHaveBeenCalled();
    const createdBom = bomCreate.mock.calls[0][0].data;
    expect(createdBom.parentStyleId).toBe('style1');
    expect(createdBom.nodeId).toBe('n1');
    expect(createdBom.variantId).toBe('dvar1');
    expect(createdBom.items.create).toHaveLength(1);
  });
});
