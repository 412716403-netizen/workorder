import { describe, it, expect, vi, beforeEach } from 'vitest';

const createBom = vi.fn();
const updateBom = vi.fn();
const deleteBom = vi.fn();
const updateProduct = vi.fn();

vi.mock('../src/services/products.service.js', () => ({
  createBom: (...args: unknown[]) => createBom(...args),
  updateBom: (...args: unknown[]) => updateBom(...args),
  deleteBom: (...args: unknown[]) => deleteBom(...args),
  updateProduct: (...args: unknown[]) => updateProduct(...args),
}));

import {
  syncPublishedProductBomFromDevBomChange,
  syncPublishedProductFromDevStyle,
} from '../src/services/dev-published-sync.service.js';

// 定向路径失败时回退全量 syncPublishedProductFromDevStyle（本文件通过 updateProduct/deleteMany 断言）

describe('syncPublishedProductBomFromDevBomChange', () => {
  beforeEach(() => {
    createBom.mockReset();
    updateBom.mockReset();
    deleteBom.mockReset();
    updateProduct.mockReset();
    createBom.mockResolvedValue({});
    updateBom.mockResolvedValue({});
    deleteBom.mockResolvedValue({ message: '已删除' });
  });

  function baseDb(opts?: {
    publishedProductId?: string | null;
    styleVariants?: Array<{
      id: string;
      colorId: string | null;
      sizeId: string | null;
      skuSuffix?: string | null;
    }>;
    productVariants?: Array<{
      id: string;
      colorId: string | null;
      sizeId: string | null;
      nodeBoms: Record<string, string>;
    }>;
    scopedBomsByVariant?: Record<string, Array<{ id: string }>>;
  }) {
    const publishedProductId = opts?.publishedProductId === undefined ? 'prod1' : opts.publishedProductId;
    const styleVariants = opts?.styleVariants ?? [
      { id: 'dv1', colorId: 'c1', sizeId: 's1', skuSuffix: null },
      { id: 'dv2', colorId: 'c2', sizeId: 's1', skuSuffix: null },
    ];
    const productVariants = opts?.productVariants ?? [
      { id: 'pv1', colorId: 'c1', sizeId: 's1', nodeBoms: { n1: 'bom-old', n2: 'bom-other' } },
      { id: 'pv2', colorId: 'c2', sizeId: 's1', nodeBoms: { n1: 'bom-old-2', n2: 'bom-other-2' } },
    ];

    const productVariantUpdate = vi.fn(async () => ({}));
    const scopedBomsByVariant = opts?.scopedBomsByVariant ?? {
      pv1: [{ id: 'bom-old' }],
      pv2: [{ id: 'bom-old-2' }],
    };
    const bomFindMany = vi.fn(async ({
      where: { variantId },
    }: {
      where: { variantId: string };
    }) => scopedBomsByVariant[variantId] ?? []);
    const bomFindUnique = vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
      if (String(id).startsWith('bom-')) return { id, parentProductId: 'prod1' };
      return null;
    });

    const db = {
      devStyle: {
        findUnique: vi.fn(async () =>
          publishedProductId
            ? {
                id: 'style1',
                publishedProductId,
                code: 'D001',
                variants: styleVariants,
                // 全量兜底会读这些字段
                name: '款A',
                imageUrl: null,
                categoryId: null,
                categoryCustomData: {},
                colorIds: ['c1', 'c2'],
                sizeIds: ['s1'],
                milestoneNodeIds: ['n1', 'n2'],
                salesPrice: null,
                purchasePrice: null,
                unitId: null,
                supplierId: null,
                boms: [],
              }
            : null,
        ),
      },
      productVariant: {
        findMany: vi.fn(async () => productVariants),
        update: productVariantUpdate,
      },
      bom: {
        findUnique: bomFindUnique,
        findMany: bomFindMany,
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      product: {
        findUnique: vi.fn(async () => ({ id: 'prod1', variants: productVariants })),
      },
    };
    return { db: db as never, productVariantUpdate, bomFindUnique, bomFindMany };
  }

  it('no-ops when style is unpublished', async () => {
    const { db } = baseDb({ publishedProductId: null });
    // findUnique 返回 null（上面实现 publishedProductId null → null）
    (db as { devStyle: { findUnique: ReturnType<typeof vi.fn> } }).devStyle.findUnique.mockResolvedValueOnce({
      id: 'style1',
      publishedProductId: null,
      code: 'D001',
      variants: [],
    });
    await syncPublishedProductBomFromDevBomChange(db, 'tenant1', 'style1', {
      action: 'upsert',
      bom: {
        id: 'dbom1',
        name: null,
        variantId: 'dv1',
        nodeId: 'n1',
        items: [{ categoryId: null, productId: 'mat1', quantity: 1, note: null, useShortageOnly: false, excludeFromWeightShare: false, sortOrder: 0 }],
      },
    });
    expect(updateBom).not.toHaveBeenCalled();
    expect(createBom).not.toHaveBeenCalled();
    expect(deleteBom).not.toHaveBeenCalled();
  });

  it('updates only the target product BOM for a multi-variant style', async () => {
    const { db, productVariantUpdate } = baseDb();
    await syncPublishedProductBomFromDevBomChange(db, 'tenant1', 'style1', {
      action: 'upsert',
      bom: {
        id: 'dbom1',
        name: '缝制',
        variantId: 'dv1',
        nodeId: 'n1',
        items: [
          {
            categoryId: null,
            productId: 'mat1',
            quantity: 2,
            note: null,
            useShortageOnly: false,
            excludeFromWeightShare: false,
            sortOrder: 0,
          },
        ],
      },
    });

    expect(updateBom).toHaveBeenCalledTimes(1);
    expect(updateBom.mock.calls[0][1]).toBe('bom-old');
    expect(createBom).not.toHaveBeenCalled();
    expect(deleteBom).not.toHaveBeenCalled();
    // 其它规格未动
    expect(productVariantUpdate).not.toHaveBeenCalled();
  });

  it('updates the scoped product BOM when nodeBoms mapping is missing', async () => {
    const { db, productVariantUpdate } = baseDb({
      productVariants: [
        { id: 'pv1', colorId: 'c1', sizeId: 's1', nodeBoms: { n2: 'bom-other' } },
        { id: 'pv2', colorId: 'c2', sizeId: 's1', nodeBoms: { n2: 'bom-other-2' } },
      ],
      scopedBomsByVariant: {
        pv1: [{ id: 'bom-existing-by-scope' }],
      },
    });

    await syncPublishedProductBomFromDevBomChange(db, 'tenant1', 'style1', {
      action: 'upsert',
      bom: {
        id: 'dbom1',
        name: '缝制',
        variantId: 'dv1',
        nodeId: 'n1',
        items: [
          {
            categoryId: null,
            productId: 'mat1',
            quantity: 2,
            note: null,
            useShortageOnly: false,
            excludeFromWeightShare: false,
            sortOrder: 0,
          },
        ],
      },
    });

    expect(updateBom.mock.calls[0][1]).toBe('bom-existing-by-scope');
    expect(createBom).not.toHaveBeenCalled();
    expect(productVariantUpdate).toHaveBeenCalledWith({
      where: { id: 'pv1' },
      data: {
        nodeBoms: {
          n1: 'bom-existing-by-scope',
          n2: 'bom-other',
        },
      },
    });
  });

  it('deletes only the affected product BOM and clears nodeBoms mapping', async () => {
    const { db, productVariantUpdate } = baseDb();
    await syncPublishedProductBomFromDevBomChange(db, 'tenant1', 'style1', {
      action: 'delete',
      bom: {
        id: 'dbom1',
        name: null,
        variantId: 'dv1',
        nodeId: 'n1',
        items: [],
      },
    });

    expect(deleteBom).toHaveBeenCalledWith(db, 'bom-old');
    expect(productVariantUpdate).toHaveBeenCalledWith({
      where: { id: 'pv1' },
      data: { nodeBoms: { n2: 'bom-other' } },
    });
    expect(updateBom).not.toHaveBeenCalled();
  });

  it('treats empty items as published-side removal (物料可清空)', async () => {
    const { db, productVariantUpdate } = baseDb();
    await syncPublishedProductBomFromDevBomChange(db, 'tenant1', 'style1', {
      action: 'upsert',
      bom: {
        id: 'dbom1',
        name: null,
        variantId: 'dv1',
        nodeId: 'n1',
        items: [],
      },
    });
    expect(deleteBom).toHaveBeenCalledWith(db, 'bom-old');
    expect(productVariantUpdate).toHaveBeenCalled();
  });

  it('falls back to full rebuild when product variant mapping is missing', async () => {
    const { db } = baseDb({
      productVariants: [
        // 缺 pv for c2
        { id: 'pv1', colorId: 'c1', sizeId: 's1', nodeBoms: {} },
      ],
    });

    await syncPublishedProductBomFromDevBomChange(db, 'tenant1', 'style1', {
      action: 'upsert',
      bom: {
        id: 'dbom1',
        name: null,
        variantId: 'dv2',
        nodeId: 'n1',
        items: [
          {
            categoryId: null,
            productId: 'mat1',
            quantity: 1,
            note: null,
            useShortageOnly: false,
            excludeFromWeightShare: false,
            sortOrder: 0,
          },
        ],
      },
    });

    // 全量路径会 updateProduct + deleteMany(bom)
    expect(updateProduct).toHaveBeenCalled();
    expect((db as { bom: { deleteMany: ReturnType<typeof vi.fn> } }).bom.deleteMany).toHaveBeenCalled();
    expect(updateBom).not.toHaveBeenCalled();
  });

  it('single-SKU style updates the default product variant only', async () => {
    const { db, productVariantUpdate } = baseDb({
      styleVariants: [],
      productVariants: [
        { id: 'pv-default', colorId: null, sizeId: null, nodeBoms: {} },
      ],
      scopedBomsByVariant: {},
    });

    await syncPublishedProductBomFromDevBomChange(db, 'tenant1', 'style1', {
      action: 'upsert',
      bom: {
        id: 'dbom1',
        name: null,
        variantId: null,
        nodeId: 'n1',
        items: [
          {
            categoryId: null,
            productId: 'mat1',
            quantity: 1,
            note: null,
            useShortageOnly: false,
            excludeFromWeightShare: false,
            sortOrder: 0,
          },
        ],
      },
    });

    expect(createBom).toHaveBeenCalledTimes(1);
    expect(productVariantUpdate).toHaveBeenCalledWith({
      where: { id: 'pv-default' },
      data: { nodeBoms: { n1: expect.stringMatching(/^bom-/) } },
    });
  });
});

// 防止未使用 import 被 tree-shake 掉（类型/导出可用性检查）
describe('exports', () => {
  it('exposes full sync for fallback callers', () => {
    expect(typeof syncPublishedProductFromDevStyle).toBe('function');
  });
});
