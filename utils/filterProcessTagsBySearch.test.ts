import { describe, expect, it } from 'vitest';
import { filterProcessTagsBySearch, processNameMatchesSearch } from './filterProcessTagsBySearch';

describe('filterProcessTagsBySearch', () => {
  const tags = [
    { id: '1', name: '缝制', remaining: 10 },
    { id: '2', name: '整烫', remaining: 0 },
    { id: '3', name: '包装', remaining: 5 },
  ];
  const byQty = { getReportableQty: (t: (typeof tags)[number]) => t.remaining };

  it('空搜索返回全部且不隐藏行', () => {
    expect(filterProcessTagsBySearch(tags, '', t => t.name)).toEqual({ tags, nameHit: false, hideRow: false });
    expect(filterProcessTagsBySearch(tags, '   ', t => t.name)).toEqual({ tags, nameHit: false, hideRow: false });
  });

  it('命中工序名时只返回匹配标签', () => {
    expect(filterProcessTagsBySearch(tags, '缝', t => t.name)).toEqual({ tags: [tags[0]], nameHit: true, hideRow: false });
    expect(filterProcessTagsBySearch(tags, '整烫', t => t.name)).toEqual({ tags: [tags[1]], nameHit: true, hideRow: false });
  });

  it('搜工序时隐藏可报为 0 的标签，全空则要求隐藏整行', () => {
    expect(filterProcessTagsBySearch(tags, '整', t => t.name, byQty)).toEqual({ tags: [], nameHit: true, hideRow: true });
    expect(filterProcessTagsBySearch(tags, '缝', t => t.name, byQty)).toEqual({ tags: [tags[0]], nameHit: true, hideRow: false });
  });

  it('部分匹配工序可报为 0 时只留可报的，不隐藏行', () => {
    const mixed = [
      { id: 'a', name: '缝制A', remaining: 0 },
      { id: 'b', name: '缝制B', remaining: 3 },
    ];
    expect(
      filterProcessTagsBySearch(mixed, '缝制', t => t.name, { getReportableQty: t => t.remaining }),
    ).toEqual({ tags: [mixed[1]], nameHit: true, hideRow: false });
  });

  it('无工序名命中时返回全部（视为命中产品/工单等），不按可报过滤', () => {
    expect(filterProcessTagsBySearch(tags, '毛衣', t => t.name, byQty)).toEqual({ tags, nameHit: false, hideRow: false });
  });

  it('空标签列表安全', () => {
    expect(filterProcessTagsBySearch([], '缝', (t: { name: string }) => t.name)).toEqual({
      tags: [],
      nameHit: false,
      hideRow: false,
    });
  });
});

describe('processNameMatchesSearch', () => {
  it('子串、大小写不敏感', () => {
    expect(processNameMatchesSearch('缝制', '缝')).toBe(true);
    expect(processNameMatchesSearch('缝制', 'SEW')).toBe(false);
    expect(processNameMatchesSearch('Pack', 'pack')).toBe(true);
    expect(processNameMatchesSearch('', 'x')).toBe(false);
    expect(processNameMatchesSearch('缝制', '')).toBe(false);
  });
});
