import { useState, useMemo, useCallback } from 'react';

const PAGE_SIZE = 80;

/**
 * Progressively renders a large list — shows first PAGE_SIZE items,
 * with a "show more" action to reveal the next batch.
 * Resets visible count when the source array identity changes.
 */
export function useProgressiveList<T>(items: T[]) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = items.length > visibleCount;
  const remaining = items.length - visibleCount;

  const showMore = useCallback(() => {
    setVisibleCount(prev => prev + PAGE_SIZE);
  }, []);

  const showAll = useCallback(() => {
    setVisibleCount(items.length);
  }, [items.length]);

  // Reset when source list changes significantly (e.g., filter applied)
  useMemo(() => {
    setVisibleCount(PAGE_SIZE);
  }, [items]);

  return { visibleItems, hasMore, remaining, showMore, showAll, total: items.length };
}
