import { useMemo } from 'react';
import { useQueries, keepPreviousData } from '@tanstack/react-query';
import { finance, type FinanceSummary } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { WorkbenchPeriodFilter } from '../types';
import {
  isValidWorkbenchCustomRange,
  workbenchPeriodFilterQueryKey,
  workbenchPeriodFilterToIsoRange,
} from '../types';

function financeStatsQueryKey(tenantId: string | undefined, suffix: string, filterKey: string) {
  return ['finance', tenantId ?? '', 'workbenchStats', suffix, filterKey] as const;
}

function toAmount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickTypeAmount(summary: FinanceSummary | undefined, type: string): number {
  return toAmount(summary?.byType.find(r => r.type === type)?.amount);
}

function pickTypeCount(summary: FinanceSummary | undefined, type: string): number {
  return summary?.byType.find(r => r.type === type)?.count ?? 0;
}

export function useFinanceWorkbenchStats(filter: WorkbenchPeriodFilter) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;

  const periodEnabled =
    !!tenantId
    && (filter.mode !== 'custom'
      || isValidWorkbenchCustomRange(filter.startDate, filter.endDate));

  const filterKey = workbenchPeriodFilterQueryKey(filter);

  const dateRange = useMemo(() => {
    if (!periodEnabled) return null;
    return workbenchPeriodFilterToIsoRange(filter);
  }, [filter, periodEnabled]);

  const results = useQueries({
    queries: [
      {
        queryKey: financeStatsQueryKey(tenantId, 'periodAll', filterKey),
        queryFn: () => finance.summary(dateRange!),
        staleTime: 60_000,
        enabled: periodEnabled && !!dateRange,
        placeholderData: keepPreviousData,
      },
      {
        queryKey: financeStatsQueryKey(tenantId, 'periodReceipt', filterKey),
        queryFn: () => finance.summary({ ...dateRange!, type: 'RECEIPT' }),
        staleTime: 60_000,
        enabled: periodEnabled && !!dateRange,
        placeholderData: keepPreviousData,
      },
      {
        queryKey: financeStatsQueryKey(tenantId, 'periodPayment', filterKey),
        queryFn: () => finance.summary({ ...dateRange!, type: 'PAYMENT' }),
        staleTime: 60_000,
        enabled: periodEnabled && !!dateRange,
        placeholderData: keepPreviousData,
      },
    ],
  });

  const [periodAll, periodReceipt, periodPayment] = results;

  const isLoading = results.some(r => r.isLoading);
  const isFetching = results.some(r => r.isFetching);

  const refetch = () => {
    void Promise.all(results.map(r => r.refetch()));
  };

  const otherTypes = useMemo(() => {
    const types = ['SETTLEMENT', 'RECONCILIATION'] as const;
    return types
      .map(type => ({
        type,
        amount: pickTypeAmount(periodAll.data, type),
        count: pickTypeCount(periodAll.data, type),
      }))
      .filter(r => r.amount !== 0 || r.count > 0);
  }, [periodAll.data]);

  return {
    periodAll: periodAll.data,
    periodReceipt: periodReceipt.data,
    periodPayment: periodPayment.data,
    otherTypes,
    isLoading,
    isFetching,
    refetch,
    enabled: periodEnabled,
  };
}
