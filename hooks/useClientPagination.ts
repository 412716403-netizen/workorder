import { useEffect, useMemo, useState } from 'react';

/** 列表前端翻页：筛选条件变化时自动回到第 1 页 */
export function useClientPagination<T>(
  items: T[],
  pageSize: number,
  resetKey: string,
) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const safePage = Math.min(Math.max(1, page), totalPages);

  const pagedItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  return {
    page: safePage,
    setPage,
    totalPages,
    pagedItems,
    total,
    pageSize,
    showPager: totalPages > 1,
  };
}
