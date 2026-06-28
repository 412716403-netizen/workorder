import { useQuery } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import type { WorkbenchPeriodFilter } from '../types';
import { isValidWorkbenchCustomRange, workbenchPeriodFilterQueryKey } from '../types';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';

export function useDashboardOrderStats(filter: WorkbenchPeriodFilter) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryEnabled =
    !!tenantId
    && (filter.mode !== 'custom'
      || isValidWorkbenchCustomRange(filter.startDate, filter.endDate));

  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'order-stats', workbenchPeriodFilterQueryKey(filter)),
    queryFn: () =>
      dashboard.getOrderStats(
        filter.mode === 'custom'
          ? { startDate: filter.startDate, endDate: filter.endDate }
          : { period: filter.period },
      ),
    staleTime: 30_000,
    enabled: queryEnabled,
  });
}
