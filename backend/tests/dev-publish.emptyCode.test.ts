import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DevStyleStatus } from '../../shared/types.js';

const createProduct = vi.fn(async () => undefined);
const createBom = vi.fn(async () => undefined);

vi.mock('../src/services/products.service.js', () => ({
  createProduct: (...args: unknown[]) => createProduct(...args),
  createBom: (...args: unknown[]) => createBom(...args),
}));

import { publishDevStyleToProduct } from '../src/services/dev-publish.service.js';

type StyleOverrides = { code?: string | null; name?: string; variants?: unknown[] };

function archivedStyle(overrides: StyleOverrides = {}) {
  return {
    id: 'style-1',
    code: overrides.code === undefined ? null : overrides.code,
    name: overrides.name === undefined ? '01003' : overrides.name,
    customerName: null,
    imageUrl: null,
    imageThumb: null,
    categoryId: 'cat-1',
    categoryCustomData: {},
    colorIds: [],
    sizeIds: [],
    milestoneNodeIds: [],
    defaultStageNames: [],
    salesPrice: null,
    purchasePrice: null,
    unitId: null,
    supplierId: null,
    status: DevStyleStatus.ARCHIVED,
    publishedProductId: null,
    createdAt: new Date('2026-07-28T00:00:00Z'),
    updatedAt: new Date('2026-07-28T00:00:00Z'),
    variants: overrides.variants ?? [],
    samples: [],
    boms: [],
  };
}

function mockDb(style: ReturnType<typeof archivedStyle>) {
  const db: Record<string, unknown> = {
    devStyle: {
      findUnique: vi.fn(async () => style),
      update: vi.fn(async () => style),
    },
    product: { findFirst: vi.fn(async () => null) },
  };
  db.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
  return db;
}

/** createProduct 收到的入参（第三个参数为产品草稿） */
function productDraft(): Record<string, unknown> {
  return createProduct.mock.calls[0][2] as unknown as Record<string, unknown>;
}

beforeEach(() => {
  createProduct.mockClear();
  createBom.mockClear();
});

describe('publishDevStyleToProduct 款号为空', () => {
  it('款号为空也能生成商品，sku 传空串交由 createProduct 归一化为 NULL', async () => {
    const db = mockDb(archivedStyle({ code: null }));

    const result = await publishDevStyleToProduct(db as never, 'tenant-1', 'style-1');

    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(productDraft().sku).toBe('');
    expect(productDraft().name).toBe('01003');
    expect(result.productId).toMatch(/^prod/);
  });

  it('款号为空时单 SKU 变体的 skuSuffix 为空串', async () => {
    const db = mockDb(archivedStyle({ code: '   ' }));

    await publishDevStyleToProduct(db as never, 'tenant-1', 'style-1');

    const variants = productDraft().variants as Array<{ skuSuffix: string }>;
    expect(variants).toHaveLength(1);
    expect(variants[0].skuSuffix).toBe('');
  });

  it('款号有值时仍写入 sku 与单 SKU 变体后缀（去空格）', async () => {
    const db = mockDb(archivedStyle({ code: ' 速度传感器 ' }));

    await publishDevStyleToProduct(db as never, 'tenant-1', 'style-1');

    expect(productDraft().sku).toBe('速度传感器');
    const variants = productDraft().variants as Array<{ skuSuffix: string }>;
    expect(variants[0].skuSuffix).toBe('速度传感器');
  });

  it('品名仍然必填', async () => {
    const db = mockDb(archivedStyle({ name: '  ' }));

    await expect(publishDevStyleToProduct(db as never, 'tenant-1', 'style-1')).rejects.toThrow(
      '品名不能为空',
    );
    expect(createProduct).not.toHaveBeenCalled();
  });
});
