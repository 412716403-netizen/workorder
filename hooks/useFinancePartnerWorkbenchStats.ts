import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import { useAuth } from '../contexts/AuthContext';
import type { WorkbenchPeriodFilter } from '../types';
import { isValidWorkbenchCustomRange, workbenchPeriodFilterQueryKey } from '../types';
import { dashboardQueryKey } from './dashboardQueryKeys';

function statsQueryParams(filter: WorkbenchPeriodFilter) {
  if (filter.mode === 'custom') {
    return { startDate: filter.startDate, endDate: filter.endDate };
  }
  return { period: filter.period };
}

export function useFinancePartnerWorkbenchStats(filter: WorkbenchPeriodFilter) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryEnabled =
    !!tenantId
    && (filter.mode !== 'custom'
      || isValidWorkbenchCustomRange(filter.startDate, filter.endDate));

  return useQuery({
    queryKey: dashboardQueryKey(
      tenantId,
      'financePartnerStats',
      workbenchPeriodFilterQueryKey(filter),
    ),
    queryFn: () => dashboard.getFinancePartnerStats(statsQueryParams(filter)),
    staleTime: 60_000,
    enabled: queryEnabled,
    placeholderData: keepPreviousData,
  });
}
