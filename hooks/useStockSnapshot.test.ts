// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../services/api', () => ({
  psi: {
    getStockSnapshot: vi.fn(),
  },
}));

import * as api from '../services/api';
import { useStockSnapshot, stockSnapshotQueryKey, STOCK_SNAPSHOT_QK_BASE } from './useStockSnapshot';

const mockGetStockSnapshot = api.psi.getStockSnapshot as unknown as ReturnType<typeof vi.fn>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
}

const emptyBucketFields = {
  psiIn: 0, psiOut: 0, transferIn: 0, transferOut: 0,
  prodIn: 0, prodOut: 0, stocktakeAdj: 0,
};

describe('useStockSnapshot', () => {
  beforeEach(() => {
    mockGetStockSnapshot.mockReset();
  });

  it('queryKey 工具函数稳定，按 (productId, warehouseId) 区分', () => {
    expect(stockSnapshotQueryKey('p1', 'w1')).toEqual([
      ...STOCK_SNAPSHOT_QK_BASE, { productId: 'p1', warehouseId: 'w1' },
    ]);
    expect(stockSnapshotQueryKey()).toEqual([
      ...STOCK_SNAPSHOT_QK_BASE, { productId: null, warehouseId: null },
    ]);
  });

  it('空数据：getStock 返回 0，listAvailableBatches 返回 []', async () => {
    mockGetStockSnapshot.mockResolvedValue({ byWarehouse: [], byVariant: [], byBatch: [] });
    const { result } = renderHook(() => useStockSnapshot(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getStock('p1', 'w1')).toBe(0);
    expect(result.current.listAvailableBatches('p1', 'w1')).toEqual([]);
  });

  it('getStock 用 byWarehouse 净值口径 (in - out + stocktakeAdj)', async () => {
    mockGetStockSnapshot.mockResolvedValue({
      byWarehouse: [
        { ...emptyBucketFields, productId: 'p1', warehouseId: 'w1', psiIn: 100, psiOut: 30, prodIn: 5, stocktakeAdj: 2 },
      ],
      byVariant: [],
      byBatch: [],
    });
    const { result } = renderHook(() => useStockSnapshot(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getStock('p1', 'w1')).toBe(77); // 100 + 5 - 30 + 2
    expect(result.current.getStock('p1')).toBe(0); // whId 缺失 → 0
    expect(result.current.getStock('p_other', 'w1')).toBe(0); // 不存在 → 0
  });

  it('getStockVariant 不计 stocktakeAdj；getVariantDisplayQty 优先用后端 displayQty', async () => {
    mockGetStockSnapshot.mockResolvedValue({
      byWarehouse: [],
      byVariant: [
        { ...emptyBucketFields, productId: 'p1', warehouseId: 'w1', variantId: 'va', psiIn: 50, psiOut: 10 },
        { ...emptyBucketFields, productId: 'p1', warehouseId: 'w1', variantId: 'vb', psiIn: 30, displayQty: 25 },
      ],
      byBatch: [],
    });
    const { result } = renderHook(() => useStockSnapshot(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getStockVariant('p1', 'w1', 'va')).toBe(40);
    // vb 有 displayQty=25，优先返回 displayQty 而非净值 30
    expect(result.current.getVariantDisplayQty('p1', 'w1', 'vb')).toBe(25);
    // va 无 displayQty，回落到净值
    expect(result.current.getVariantDisplayQty('p1', 'w1', 'va')).toBe(40);
  });

  it('listAvailableBatches 按批次过滤负值/空批号并按 zh-CN 排序', async () => {
    mockGetStockSnapshot.mockResolvedValue({
      byWarehouse: [],
      byVariant: [],
      byBatch: [
        { ...emptyBucketFields, productId: 'p1', warehouseId: 'w1', batchNo: 'B-2', psiIn: 30 },
        { ...emptyBucketFields, productId: 'p1', warehouseId: 'w1', batchNo: 'B-1', psiIn: 50, psiOut: 10 },
        { ...emptyBucketFields, productId: 'p1', warehouseId: 'w1', batchNo: 'B-3', psiIn: 5, psiOut: 5 }, // 净值=0，丢弃
        { ...emptyBucketFields, productId: 'p1', warehouseId: 'w1', batchNo: '', psiIn: 20 }, // 空批号丢弃
        { ...emptyBucketFields, productId: 'p2', warehouseId: 'w1', batchNo: 'X-1', psiIn: 100 }, // 别的产品
      ],
    });
    const { result } = renderHook(() => useStockSnapshot(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const rows = result.current.listAvailableBatches('p1', 'w1');
    expect(rows).toEqual([
      { batchNo: 'B-1', stock: 40 },
      { batchNo: 'B-2', stock: 30 },
    ]);
  });

  it('getNullVariantProdStock 用 varMap "::"（空 variantId）桶且不为负', async () => {
    mockGetStockSnapshot.mockResolvedValue({
      byWarehouse: [],
      byVariant: [
        { ...emptyBucketFields, productId: 'p1', warehouseId: 'w1', variantId: '', prodIn: 10, prodOut: 3 },
        { ...emptyBucketFields, productId: 'p2', warehouseId: 'w1', variantId: '', prodIn: 1, prodOut: 5 },
      ],
      byBatch: [],
    });
    const { result } = renderHook(() => useStockSnapshot(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getNullVariantProdStock('p1', 'w1')).toBe(7);
    expect(result.current.getNullVariantProdStock('p2', 'w1')).toBe(0); // Math.max(0, 1-5)
    expect(result.current.getNullVariantProdStock('p1')).toBe(0);
  });

  it('enabled=false 时不发起请求', async () => {
    mockGetStockSnapshot.mockResolvedValue({ byWarehouse: [], byVariant: [], byBatch: [] });
    const { result } = renderHook(() => useStockSnapshot({ enabled: false }), { wrapper: makeWrapper() });
    // react-query enabled:false 时 isLoading 仍可能 true 但 isFetching false（v5）
    expect(result.current.isFetching).toBe(false);
    expect(mockGetStockSnapshot).not.toHaveBeenCalled();
  });
});
