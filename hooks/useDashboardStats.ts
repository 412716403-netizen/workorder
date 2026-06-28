import { useQuery } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import type { WorkbenchPeriodFilter } from '../types';
import { isValidWorkbenchCustomRange, workbenchPeriodFilterQueryKey } from '../types';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';

function statsQueryParams(filter: WorkbenchPeriodFilter) {
  if (filter.mode === 'custom') {
    return { startDate: filter.startDate, endDate: filter.endDate };
  }
  return { period: filter.period };
}

export function useDashboardStats(
  segment: 'sales' | 'salesOrder' | 'finance',
  filter: WorkbenchPeriodFilter,
) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryEnabled =
    !!tenantId
    && (filter.mode !== 'custom'
      || isValidWorkbenchCustomRange(filter.startDate, filter.endDate));

  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'stats', segment, workbenchPeriodFilterQueryKey(filter)),
    queryFn: () => dashboard.getStats(statsQueryParams(filter)),
    staleTime: 60_000,
    enabled: queryEnabled,
  });
}
