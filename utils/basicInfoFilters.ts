/**
 * BasicInfoView 用到的过滤/排序纯函数 (Phase 3.9 抽离)。
 *
 * 把视图层各 tab 的 filter / sort 抽出来，方便单测。
 */

export type DictKind = 'color' | 'size' | 'unit';

export interface DictRowLike {
  id: string;
  kind: DictKind;
  name: string;
  value?: string | null;
}

/**
 * 字典行按 kind 过滤 + 按关键字搜索（name / value 任一命中）+ 按 kind→name 排序。
 *  - keyword 大小写不敏感
 *  - 排序：color < size < unit；同 kind 内按 name zh-CN locale 升序
 *  - kindFilter === 'all' 时不按 kind 过滤
 */
export function filterAndSortDictionaryRows(
  rows: ReadonlyArray<DictRowLike>,
  options: { kindFilter: DictKind | 'all'; keyword: string },
): DictRowLike[] {
  const { kindFilter, keyword } = options;
  const byKind = kindFilter === 'all' ? rows : rows.filter(r => r.kind === kindFilter);
  const t = keyword.trim().toLowerCase();
  const bySearch = !t
    ? byKind
    : byKind.filter(
        r => r.name.toLowerCase().includes(t) || (r.value && r.value.toLowerCase().includes(t)),
      );
  const kindOrder: Record<DictKind, number> = { color: 0, size: 1, unit: 2 };
  return [...bySearch].sort((a, b) => {
    const d = kindOrder[a.kind] - kindOrder[b.kind];
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

export interface PartnerLike {
  id: string;
  name: string;
  categoryId?: string | null;
}

/**
 * 合作单位过滤：按分类 + 关键字（name 包含）。
 * - categoryId === 'all' → 不过滤分类
 * - keyword 大小写不敏感、不 trim（与原 view 行为一致；原代码也没 trim）
 */
export function filterPartnersByCategoryAndKeyword<P extends PartnerLike>(
  partners: ReadonlyArray<P>,
  categoryId: string,
  keyword: string,
): P[] {
  const term = keyword.toLowerCase();
  return partners.filter(p => {
    const matchesCategory = categoryId === 'all' || p.categoryId === categoryId;
    const matchesSearch = p.name.toLowerCase().includes(term);
    return matchesCategory && matchesSearch;
  });
}
