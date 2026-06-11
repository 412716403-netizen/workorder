import { useQuery } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import type { WorkbenchOrderStatsPeriod } from '../types';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';

export function useDashboardStats(segment: 'sales' | 'salesOrder' | 'finance', period: WorkbenchOrderStatsPeriod) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;

  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'stats', segment, period),
    queryFn: () => dashboard.getStats({ period }),
    staleTime: 60_000,
    enabled: !!tenantId,
  });
}
