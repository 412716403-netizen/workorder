/**
 * 客户端循环分页：把"服务端单页或全量数组"接口包装成"循环拉完所有页"。
 *
 * 适用场景：
 * - 对账 / 仓库流水弹窗 / 仓库视图 等需要客户端做"按日期 + 类型"的窄拉，
 *   但单页 500/200 条上限可能让大租户截断的接口。
 *
 * 行为规则：
 * - 服务端 `all=true` 时通常直接返回数组：一次拿到全部，返回即可。
 * - 服务端分页时返回 `{ data, total, page, pageSize }`：循环到 `acc.length >= total`
 *   或单页不足 `pageSize` 为止；超过 `maxPages` 直接 break + 控制台告警。
 *
 * 历史：原本在 useFinanceReconciliation / usePsiOpsRecordsList / MaterialIssueModal /
 * WarehousePanel / CollaborationInboxView 5 处各写一份 for 循环 + 不同的硬上限
 * （40 页 / 60 页 / 200 页）；现统一收口到本 util，便于一致调整与维护。
 */

export interface PaginatedLike<T> {
  data?: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  [k: string]: unknown;
}

export interface FetchAllPagesOptions {
  /** 最大循环页数，超过即 break + warn。默认 200（× pageSize 已能覆盖 4 万~10 万条）。 */
  maxPages?: number;
  /** 命中 maxPages 时的告警标签，便于日志定位调用方。 */
  warnTag?: string;
}

/**
 * @param fetcher 接收当前页码（1-based），返回单页响应。
 *   若内部 endpoint 不接受 `page`，可忽略入参并返回完整数组（一次性 break）。
 */
export async function fetchAllPages<T>(
  fetcher: (page: number) => Promise<T[] | PaginatedLike<T> | null | undefined>,
  options: FetchAllPagesOptions = {},
): Promise<T[]> {
  const { maxPages = 200, warnTag } = options;
  const acc: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const resp = await fetcher(page);
    if (!resp) break;
    if (Array.isArray(resp)) {
      acc.push(...resp);
      break;
    }
    const data = Array.isArray(resp.data) ? (resp.data as T[]) : [];
    acc.push(...data);
    const total = typeof resp.total === 'number' ? resp.total : acc.length;
    const pageSize = typeof resp.pageSize === 'number' ? resp.pageSize : data.length;
    if (data.length === 0) break;
    if (pageSize > 0 && data.length < pageSize) break;
    if (acc.length >= total) break;
    if (page >= maxPages) {
      // eslint-disable-next-line no-console
      console.warn(
        `[fetchAllPages] hit maxPages=${maxPages}${warnTag ? ` (${warnTag})` : ''}, possible data truncation`,
      );
    }
  }
  return acc;
}
