import { describe, it, expect } from 'vitest';
import {
  filterAndSortDictionaryRows,
  filterPartnersByCategoryAndKeyword,
  type DictRowLike,
} from './basicInfoFilters';

const dictRows: DictRowLike[] = [
  { id: 'c2', kind: 'color', name: '红色', value: 'RED' },
  { id: 'c1', kind: 'color', name: '蓝色', value: 'BLUE' },
  { id: 's1', kind: 'size', name: 'L', value: 'L' },
  { id: 's2', kind: 'size', name: 'M', value: 'M' },
  { id: 'u1', kind: 'unit', name: '件', value: 'PCS' },
];

describe('filterAndSortDictionaryRows', () => {
  it('kindFilter = all + 无关键字 → 按 kind→name 排 (zh-CN 拼音, 红 hong < 蓝 lan)', () => {
    const out = filterAndSortDictionaryRows(dictRows, { kindFilter: 'all', keyword: '' });
    expect(out.map(r => r.id)).toEqual(['c2', 'c1', 's1', 's2', 'u1']);
  });

  it('按 kind 过滤', () => {
    expect(filterAndSortDictionaryRows(dictRows, { kindFilter: 'size', keyword: '' })
      .map(r => r.id)).toEqual(['s1', 's2']);
  });

  it('关键字搜索：匹配 name 或 value (大小写不敏感)', () => {
    expect(filterAndSortDictionaryRows(dictRows, { kindFilter: 'all', keyword: 'red' })
      .map(r => r.id)).toEqual(['c2']);
    expect(filterAndSortDictionaryRows(dictRows, { kindFilter: 'all', keyword: 'pcs' })
      .map(r => r.id)).toEqual(['u1']);
    expect(filterAndSortDictionaryRows(dictRows, { kindFilter: 'all', keyword: '色' })
      .map(r => r.id).sort()).toEqual(['c1', 'c2']);
  });

  it('关键字去 trim (空白等价于无关键字)', () => {
    expect(filterAndSortDictionaryRows(dictRows, { kindFilter: 'all', keyword: '   ' })
      .map(r => r.id)).toEqual(['c2', 'c1', 's1', 's2', 'u1']);
  });

  it('排序稳定：同 kind 按 name zh-CN 升序', () => {
    const out = filterAndSortDictionaryRows([
      { id: '1', kind: 'color', name: 'z' },
      { id: '2', kind: 'color', name: 'a' },
    ], { kindFilter: 'all', keyword: '' });
    expect(out.map(r => r.id)).toEqual(['2', '1']);
  });
});

const partners = [
  { id: 'p1', name: '工厂 A', categoryId: 'cat1' },
  { id: 'p2', name: '工厂 B', categoryId: 'cat1' },
  { id: 'p3', name: '物流公司', categoryId: 'cat2' },
];

describe('filterPartnersByCategoryAndKeyword', () => {
  it('categoryId = all → 不过滤分类', () => {
    expect(filterPartnersByCategoryAndKeyword(partners, 'all', '').length).toBe(3);
  });
  it('按分类过滤', () => {
    expect(filterPartnersByCategoryAndKeyword(partners, 'cat1', '').map(p => p.id)).toEqual(['p1', 'p2']);
  });
  it('关键字搜索 (大小写不敏感, name 包含)', () => {
    expect(filterPartnersByCategoryAndKeyword(partners, 'all', '工厂').map(p => p.id)).toEqual(['p1', 'p2']);
    expect(filterPartnersByCategoryAndKeyword(partners, 'all', '物流').map(p => p.id)).toEqual(['p3']);
  });
  it('分类 + 关键字组合', () => {
    expect(filterPartnersByCategoryAndKeyword(partners, 'cat1', 'B').map(p => p.id)).toEqual(['p2']);
  });
  it('无任何匹配 → []', () => {
    expect(filterPartnersByCategoryAndKeyword(partners, 'all', 'XYZ')).toEqual([]);
  });
});
