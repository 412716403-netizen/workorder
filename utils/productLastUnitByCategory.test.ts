// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readLastUnitByCategoryMap,
  writeLastUnitForCategory,
  resolveDefaultUnitForNewProductCategory,
} from './productLastUnitByCategory';
import type { Product } from '../types';

const TENANT = 't-1';

describe('productLastUnitByCategory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('readLastUnitByCategoryMap：未写过返回 {}', () => {
    expect(readLastUnitByCategoryMap(TENANT)).toEqual({});
  });

  it('write / read 闭环 + tenant 隔离', () => {
    writeLastUnitForCategory(TENANT, 'cat-1', 'unit-pcs');
    writeLastUnitForCategory(TENANT, 'cat-2', 'unit-kg');
    expect(readLastUnitByCategoryMap(TENANT)).toEqual({ 'cat-1': 'unit-pcs', 'cat-2': 'unit-kg' });

    // 切换租户应是独立桶
    expect(readLastUnitByCategoryMap('t-other')).toEqual({});
  });

  it('write 空 categoryId 或空 unitId 时不写入，不产生脏数据', () => {
    writeLastUnitForCategory(TENANT, '', 'unit-x');
    writeLastUnitForCategory(TENANT, 'cat-y', '');
    writeLastUnitForCategory(TENANT, '  ', 'unit-z');
    expect(readLastUnitByCategoryMap(TENANT)).toEqual({});
  });

  it('resolveDefaultUnitForNewProductCategory：优先 LS 偏好，命中且仍在字典里', () => {
    writeLastUnitForCategory(TENANT, 'cat-1', 'unit-pcs');
    const got = resolveDefaultUnitForNewProductCategory(
      TENANT,
      'cat-1',
      [],
      new Set(['unit-pcs', 'unit-kg']),
    );
    expect(got).toBe('unit-pcs');
  });

  it('resolveDefaultUnitForNewProductCategory：LS 偏好已被删字典 → 回落到同分类已有产品最近更新的单位', () => {
    writeLastUnitForCategory(TENANT, 'cat-1', 'unit-deleted');
    const products: Product[] = [
      { id: 'p1', name: 'A', categoryId: 'cat-1', unitId: 'unit-old', updatedAt: '2026-01-01T00:00:00Z', variants: [] } as unknown as Product,
      { id: 'p2', name: 'B', categoryId: 'cat-1', unitId: 'unit-new', updatedAt: '2026-05-01T00:00:00Z', variants: [] } as unknown as Product,
      { id: 'p3', name: 'C', categoryId: 'cat-OTHER', unitId: 'unit-ignored', updatedAt: '2026-06-01T00:00:00Z', variants: [] } as unknown as Product,
    ];
    const got = resolveDefaultUnitForNewProductCategory(
      TENANT,
      'cat-1',
      products,
      new Set(['unit-old', 'unit-new']),
    );
    expect(got).toBe('unit-new');
  });

  it('resolveDefaultUnitForNewProductCategory：空字典或空 categoryId 返回 undefined', () => {
    writeLastUnitForCategory(TENANT, 'cat-1', 'unit-pcs');
    expect(resolveDefaultUnitForNewProductCategory(TENANT, '', [], new Set(['unit-pcs']))).toBeUndefined();
    expect(resolveDefaultUnitForNewProductCategory(TENANT, 'cat-1', [], new Set())).toBeUndefined();
  });
});
