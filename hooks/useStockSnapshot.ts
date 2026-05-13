/**
 * Phase 3.B：库存快照 react-query hook，替代前端 `usePsiStockIndex` 中"全量 psiRecords/prodRecords 遍历"。
 *
 * 适用：新建的视图/弹窗已无法（或不愿）持有全量 psiRecords 时使用本 hook 拉取一次后端聚合。
 * - 数据语义与 `usePsiStockIndex` 的 `whMap/varMap/batchMap` 完全对齐；
 * - 返回值携带相同的派生函数（getStock / getStockVariant / listAvailableBatches / getBatchStock 等）；
 * - 后续补充：`getVariantDisplayQty` 从后端 byVariant 桶的 `displayQty` 字段读出（无盘点时与 getStockVariant 等价）。
 *
 * 旧调用点保留 `usePsiStockIndex(psiRecords, prodRecords)` 不破坏现有行为，逐步迁移。
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import type { StockSnapshotBucket } from '../services/api';

export const STOCK_SNAPSHOT_QK_BASE = ['psi', 'stock-snapshot'] as const;

export function stockSnapshotQueryKey(productId?: string, warehouseId?: string) {
  return [...STOCK_SNAPSHOT_QK_BASE, { productId: productId ?? null, warehouseId: warehouseId ?? null }] as const;
}

export function useStockSnapshot(opts: { productId?: string; warehouseId?: string; enabled?: boolean } = {}) {
  const { productId, warehouseId, enabled = true } = opts;
  const query = useQuery({
    queryKey: stockSnapshotQueryKey(productId, warehouseId),
    queryFn: () => api.psi.getStockSnapshot({ productId, warehouseId }),
    enabled,
    staleTime: 15_000,
  });

  const data = query.data;

  const whMap = useMemo(() => {
    const m = new Map<string, StockSnapshotBucket>();
    for (const b of data?.byWarehouse ?? []) m.set(`${b.productId}::${b.warehouseId}`, b);
    return m;
  }, [data]);

  const varMap = useMemo(() => {
    const m = new Map<string, StockSnapshotBucket>();
    for (const b of data?.byVariant ?? []) m.set(`${b.productId}::${b.warehouseId}::${b.variantId ?? ''}`, b);
    return m;
  }, [data]);

  const batchMap = useMemo(() => {
    const m = new Map<string, StockSnapshotBucket>();
    for (const b of data?.byBatch ?? []) m.set(`${b.productId}::${b.warehouseId}::${b.batchNo ?? ''}`, b);
    return m;
  }, [data]);

  const getStock = useCallback((pId: string, whId?: string) => {
    if (!whId) return 0;
    const b = whMap.get(`${pId}::${whId}`);
    if (!b) return 0;
    return (b.psiIn + b.transferIn + b.prodIn) - (b.psiOut + b.transferOut + b.prodOut) + b.stocktakeAdj;
  }, [whMap]);

  const getStockVariant = useCallback((pId: string, whId: string | undefined, variantId: string) => {
    if (!whId) return 0;
    const vb = varMap.get(`${pId}::${whId}::${variantId}`);
    if (!vb) return 0;
    return (vb.psiIn + vb.transferIn + vb.prodIn) - (vb.psiOut + vb.transferOut + vb.prodOut);
  }, [varMap]);

  /**
   * Phase 3.B：与前端 `getVariantDisplayQty` 等价。
   * 若后端 byVariant 桶携带 `displayQty`（变体下有盘点），直接读出；否则回落到 net 计算。
   */
  const getVariantDisplayQty = useCallback((pId: string, whId: string, variantId: string) => {
    const vb = varMap.get(`${pId}::${whId}::${variantId}`);
    if (!vb) return 0;
    if (typeof vb.displayQty === 'number') return vb.displayQty;
    return (vb.psiIn + vb.transferIn + vb.prodIn) - (vb.psiOut + vb.transferOut + vb.prodOut);
  }, [varMap]);

  /** Phase 3.B：兜底，对齐 usePsiStockIndex.getNullVariantProdStock（无 variantId 的生产入出库净值，≥0） */
  const getNullVariantProdStock = useCallback((pId: string, whId?: string) => {
    if (!whId) return 0;
    const vb = varMap.get(`${pId}::${whId}::`);
    if (!vb) return 0;
    return Math.max(0, vb.prodIn - vb.prodOut);
  }, [varMap]);

  /** Phase 3.B：兜底，对齐 usePsiStockIndex.getStocktakeAdjust */
  const getStocktakeAdjust = useCallback((pId: string, whId: string) => {
    const b = whMap.get(`${pId}::${whId}`);
    return b ? b.stocktakeAdj : 0;
  }, [whMap]);

  const getBatchStock = useCallback((pId: string, whId: string | undefined, batchNo: string) => {
    if (!whId || !batchNo) return 0;
    const b = batchMap.get(`${pId}::${whId}::${batchNo}`);
    if (!b) return 0;
    return Math.max(0, (b.psiIn + b.transferIn + b.prodIn) - (b.psiOut + b.transferOut + b.prodOut) + b.stocktakeAdj);
  }, [batchMap]);

  const listAvailableBatches = useCallback((pId: string, whId: string | undefined) => {
    if (!whId) return [] as { batchNo: string; stock: number }[];
    const rows: { batchNo: string; stock: number }[] = [];
    for (const b of batchMap.values()) {
      if (b.productId !== pId || b.warehouseId !== whId) continue;
      const batchNo = b.batchNo ?? '';
      if (!batchNo) continue;
      const stock = Math.max(0, (b.psiIn + b.transferIn + b.prodIn) - (b.psiOut + b.transferOut + b.prodOut) + b.stocktakeAdj);
      if (stock > 0) rows.push({ batchNo, stock });
    }
    rows.sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN'));
    return rows;
  }, [batchMap]);

  return {
    query,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    getStock,
    getStockVariant,
    getVariantDisplayQty,
    getNullVariantProdStock,
    getStocktakeAdjust,
    getBatchStock,
    listAvailableBatches,
  };
}
