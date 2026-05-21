import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { psi as psiApi } from '../services/api';
import { normalizeDecimals } from '../contexts/formSettingsDefaults';
import { fetchAllPages, type PaginatedLike } from '../utils/fetchAllPages';

const DOC_TYPES = new Set(['PURCHASE_ORDER', 'PURCHASE_BILL', 'SALES_ORDER', 'SALES_BILL']);

async function fetchAllPsiPages(filter: { type: string }): Promise<unknown[]> {
  const all = await fetchAllPages<unknown>(
    page =>
      psiApi.listPaginated({
        type: filter.type,
        page: String(page),
        pageSize: '200',
      }) as Promise<unknown[] | PaginatedLike<unknown>>,
    { maxPages: 40, warnTag: `psiOpsRecords:${filter.type}` },
  );
  return normalizeDecimals(all as never[]);
}

/**
 * 进销存作业页：按当前 tab 的 `type` 从后端分页拉全量该类型（及采购订单 tab 所需的采购入库），
 * 替代 `psi.list?all=true` 全类型大包；上下文 `records` 仅作加载前占位与 mutation 后 queryKey 触发刷新。
 *
 * 仓库管理（`WAREHOUSE_MGMT`）：合并 TRANSFER、STOCKTAKE、PURCHASE_BILL、SALES_BILL，
 * 供仓库面板流水与库存反推；历史全量日期范围仍走「仓库流水」弹窗单独窄拉。
 * Phase 3.E follow-up：queryKey 不再携带 `recordsFromContext.length`。
 * 旧设计是想"context 写入后 ctxLen 变 → 自动重拉"，但 ctxLen 任何变化都会产生
 * **新 queryKey** 让旧缓存彻底失效，触发整页重新分页拉取，浪费且会让 UI 闪空。
 * 写入后的刷新统一由 `AppDataContext.invalidateAllPsiRecords()` 走 `invalidateQueries`
 * 触发，更精准也保留缓存数据期间 UI 不闪空。
 */
export function usePsiOpsRecordsList(type: string, recordsFromContext: unknown[]): unknown[] {
  const mainQuery = useQuery({
    queryKey: ['psiOpsRecords', 'main', type],
    queryFn: () => fetchAllPsiPages({ type }),
    enabled: DOC_TYPES.has(type),
    staleTime: 15_000,
  });

  const purchaseBillsForPoQuery = useQuery({
    queryKey: ['psiOpsRecords', 'PURCHASE_BILL', 'forPurchaseOrderTab'],
    queryFn: () => fetchAllPsiPages({ type: 'PURCHASE_BILL' }),
    enabled: type === 'PURCHASE_ORDER',
    staleTime: 15_000,
  });

  /**
   * 采购入库 tab 需要同时拥有「采购订单」记录：
   * - 新建采购入库时支持「引用采购订单生成」勾选并整单转化；
   * - 已收数量统计也依赖采购入库本身（已在 mainQuery 中加载），无需额外拉。
   */
  const purchaseOrdersForPbQuery = useQuery({
    queryKey: ['psiOpsRecords', 'PURCHASE_ORDER', 'forPurchaseBillTab'],
    queryFn: () => fetchAllPsiPages({ type: 'PURCHASE_ORDER' }),
    enabled: type === 'PURCHASE_BILL',
    staleTime: 15_000,
  });

  const whTransfer = useQuery({
    queryKey: ['psiOpsRecords', 'TRANSFER'],
    queryFn: () => fetchAllPsiPages({ type: 'TRANSFER' }),
    enabled: type === 'WAREHOUSE_MGMT',
    staleTime: 15_000,
  });
  const whStocktake = useQuery({
    queryKey: ['psiOpsRecords', 'STOCKTAKE'],
    queryFn: () => fetchAllPsiPages({ type: 'STOCKTAKE' }),
    enabled: type === 'WAREHOUSE_MGMT',
    staleTime: 15_000,
  });
  /** 仓库管理：流水/库存反推需要采购单入库与销售出库行（此前仅 TRANSFER+STOCKTAKE，会缺采购入库等） */
  const whPurchaseBill = useQuery({
    queryKey: ['psiOpsRecords', 'PURCHASE_BILL', 'forWarehouseMgmt'],
    queryFn: () => fetchAllPsiPages({ type: 'PURCHASE_BILL' }),
    enabled: type === 'WAREHOUSE_MGMT',
    staleTime: 15_000,
  });
  const whSalesBill = useQuery({
    queryKey: ['psiOpsRecords', 'SALES_BILL', 'forWarehouseMgmt'],
    queryFn: () => fetchAllPsiPages({ type: 'SALES_BILL' }),
    enabled: type === 'WAREHOUSE_MGMT',
    staleTime: 15_000,
  });

  return useMemo(() => {
    if (type === 'WAREHOUSE_MGMT') {
      if (
        whTransfer.isSuccess &&
        whStocktake.isSuccess &&
        whPurchaseBill.isSuccess &&
        whSalesBill.isSuccess
      ) {
        return [
          ...(whTransfer.data ?? []),
          ...(whStocktake.data ?? []),
          ...(whPurchaseBill.data ?? []),
          ...(whSalesBill.data ?? []),
        ];
      }
      return recordsFromContext;
    }
    if (type === 'PURCHASE_ORDER') {
      if (mainQuery.isSuccess && purchaseBillsForPoQuery.isSuccess) {
        const byId = new Map<string, unknown>();
        for (const r of mainQuery.data ?? []) byId.set((r as { id: string }).id, r);
        for (const r of purchaseBillsForPoQuery.data ?? []) byId.set((r as { id: string }).id, r);
        return [...byId.values()];
      }
      return recordsFromContext;
    }
    if (type === 'PURCHASE_BILL') {
      if (mainQuery.isSuccess && purchaseOrdersForPbQuery.isSuccess) {
        const byId = new Map<string, unknown>();
        for (const r of mainQuery.data ?? []) byId.set((r as { id: string }).id, r);
        for (const r of purchaseOrdersForPbQuery.data ?? []) byId.set((r as { id: string }).id, r);
        return [...byId.values()];
      }
      return recordsFromContext;
    }
    if (DOC_TYPES.has(type) && mainQuery.isSuccess) {
      return mainQuery.data ?? [];
    }
    return recordsFromContext;
  }, [
    type,
    recordsFromContext,
    mainQuery.isSuccess,
    mainQuery.data,
    purchaseBillsForPoQuery.isSuccess,
    purchaseBillsForPoQuery.data,
    purchaseOrdersForPbQuery.isSuccess,
    purchaseOrdersForPbQuery.data,
    whTransfer.isSuccess,
    whTransfer.data,
    whStocktake.isSuccess,
    whStocktake.data,
    whPurchaseBill.isSuccess,
    whPurchaseBill.data,
    whSalesBill.isSuccess,
    whSalesBill.data,
  ]);
}
