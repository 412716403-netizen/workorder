import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantPrismaClient } from '../src/lib/prisma.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { importPartners } from '../src/services/masterData.service.js';

type StoredPartner = {
  id: string;
  name: string;
  categoryId: string;
  contact: string | null;
  customData: Record<string, unknown>;
  partnerListNo: number;
};

function makeDb(opts?: { categoryId?: string | null; existing?: StoredPartner[] }) {
  const categoryId = opts?.categoryId ?? 'pcat-1';
  const stored: StoredPartner[] = [...(opts?.existing ?? [])];

  const db = {
    partnerCategory: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        categoryId && where.id === categoryId ? { id: categoryId, name: '供应商' } : null,
      ),
    },
    partner: {
      findMany: vi.fn(async () => stored.map((p) => ({ name: p.name }))),
      aggregate: vi.fn(async () => ({
        _max: {
          partnerListNo: stored.length > 0 ? Math.max(...stored.map((p) => p.partnerListNo)) : null,
        },
      })),
      create: vi.fn(async ({ data }: { data: StoredPartner }) => {
        stored.push(data);
        return data;
      }),
    },
  };

  return { db: db as unknown as TenantPrismaClient, stored };
}

describe('importPartners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 400 when categoryId missing', async () => {
    const { db } = makeDb();
    await expect(importPartners(db, { categoryId: '', partners: [{ name: 'A' }] })).rejects.toThrow(AppError);
    await expect(importPartners(db, { categoryId: '', partners: [{ name: 'A' }] })).rejects.toThrow(/必须指定单位分类/);
  });

  it('throws 400 when partners empty', async () => {
    const { db } = makeDb();
    await expect(importPartners(db, { categoryId: 'pcat-1', partners: [] })).rejects.toThrow(/导入数据不能为空/);
  });

  it('throws 404 when category not found', async () => {
    const { db } = makeDb({ categoryId: null });
    await expect(importPartners(db, { categoryId: 'missing', partners: [{ name: 'A' }] })).rejects.toThrow(/合作单位分类不存在/);
  });

  it('imports partners with incrementing partnerListNo', async () => {
    const { db, stored } = makeDb({
      existing: [{ id: 'p1', name: '已有', categoryId: 'pcat-1', contact: null, customData: {}, partnerListNo: 5 }],
    });

    const result = await importPartners(db, {
      categoryId: 'pcat-1',
      partners: [
        { name: '  单位A  ', customData: { phone: '13800000000' } },
        { name: '单位B' },
      ],
    });

    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(stored).toHaveLength(3);
    expect(stored[1].name).toBe('单位A');
    expect(stored[1].partnerListNo).toBe(6);
    expect(stored[1].customData).toEqual({ phone: '13800000000' });
    expect(stored[2].partnerListNo).toBe(7);
  });

  it('skips duplicate names in database and batch', async () => {
    const { db, stored } = makeDb({
      existing: [{ id: 'p1', name: '已有单位', categoryId: 'pcat-1', contact: null, customData: {}, partnerListNo: 1 }],
    });

    const result = await importPartners(db, {
      categoryId: 'pcat-1',
      partners: [
        { name: '已有单位' },
        { name: '新单位' },
        { name: '新单位' },
        { name: '' },
      ],
    });

    expect(result.success).toBe(1);
    expect(result.failed).toBe(3);
    expect(stored).toHaveLength(2);
    expect(result.results.find((r) => r.row === 1)?.reason).toMatch(/已存在/);
    expect(result.results.find((r) => r.row === 3)?.reason).toMatch(/文件中重复/);
    expect(result.results.find((r) => r.row === 4)?.reason).toMatch(/不能为空/);
  });
});
