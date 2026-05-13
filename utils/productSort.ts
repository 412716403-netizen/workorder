import type { Product } from '../types';

/**
 * 产品档案列表 / 搜索下拉共用的排序时间戳：
 * 优先 `createdAt` / `updatedAt`，否则从 `p-时间戳-` 形态 id 解析。
 */
export function productSortTimeMs(p: Product): number {
  const withMeta = p as Product & { createdAt?: string; updatedAt?: string };
  const ts = Date.parse(withMeta.createdAt ?? withMeta.updatedAt ?? '');
  if (Number.isFinite(ts) && ts > 0) return ts;
  const m = /^p-(\d+)-/.exec(p.id ?? '');
  if (m) {
    const idTs = Number(m[1]);
    if (Number.isFinite(idTs) && idTs > 0) return idTs;
  }
  return 0;
}

/** 与「产品与 BOM 档案中心」列表一致：新在前，同时间按 id 降序 */
export function compareProductsArchiveOrder(a: Product, b: Product): number {
  const t = productSortTimeMs(b) - productSortTimeMs(a);
  if (t !== 0) return t;
  return b.id.localeCompare(a.id, 'zh-CN');
}
