export interface ProcessTagSearchResult<T> {
  /** 过滤后应展示的工序标签 */
  tags: T[];
  /** 搜索词命中了至少一个工序名（用于判断整行是否因工序而命中） */
  nameHit: boolean;
  /**
   * 搜索命中了工序名，但按可报数量过滤后一个都不剩。
   * 调用方据此隐藏整行（行过滤与标签过滤共用同一判据，避免两处口径漂移）。
   */
  hideRow: boolean;
}

/**
 * 工单中心 / 外协管理 / 返工管理主列表：按搜索词收窄工序标签。
 *
 * 一次扫描同时给出「展示哪些标签」「是否因工序命中」「是否该隐藏整行」，
 * 避免调用方分两次判断导致行过滤与标签过滤口径漂移。
 *
 * - 无搜索词 → 原样返回
 * - 命中工序名 → 只保留这些标签；给了 `getReportableQty` 时再去掉可报 ≤ 0 的，
 *   若全被去掉则 `hideRow=true`
 * - 未命中工序名（仅命中产品 / 工单号 / 客户等）→ 原样返回全部标签
 */
export function filterProcessTagsBySearch<T>(
  tags: readonly T[],
  qRaw: string,
  getName: (tag: T) => string,
  opts?: {
    /** 搜工序名命中时，仅保留可报数量 > 0 的标签 */
    getReportableQty?: (tag: T) => number;
  },
): ProcessTagSearchResult<T> {
  const q = qRaw.trim().toLowerCase();
  if (!q || tags.length === 0) return { tags: tags.slice(), nameHit: false, hideRow: false };
  const matched = tags.filter(t => getName(t).toLowerCase().includes(q));
  if (matched.length === 0) return { tags: tags.slice(), nameHit: false, hideRow: false };
  const getQty = opts?.getReportableQty;
  if (!getQty) return { tags: matched, nameHit: true, hideRow: false };
  const reportable = matched.filter(t => getQty(t) > 0);
  return { tags: reportable, nameHit: true, hideRow: reportable.length === 0 };
}

/** 工序名称是否命中搜索关键字（大小写不敏感、子串匹配） */
export function processNameMatchesSearch(name: string | null | undefined, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return false;
  return (name ?? '').toLowerCase().includes(q);
}
