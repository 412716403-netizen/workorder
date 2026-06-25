// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClientPagination } from './useClientPagination';

describe('useClientPagination', () => {
  it('slices items by page', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const { result } = renderHook(({ list, key }) => useClientPagination(list, 10, key), {
      initialProps: { list: items, key: 'a' },
    });
    expect(result.current.pagedItems).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.current.totalPages).toBe(3);
    act(() => result.current.setPage(2));
    expect(result.current.pagedItems).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('resets to page 1 when resetKey changes', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const { result, rerender } = renderHook(({ list, key }) => useClientPagination(list, 10, key), {
      initialProps: { list: items, key: 'a' },
    });
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    rerender({ list: items.slice(0, 5), key: 'b' });
    expect(result.current.page).toBe(1);
    expect(result.current.pagedItems).toHaveLength(5);
  });
});
