import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import type { WorkbenchOrderStatsPeriod } from '../types';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';

export function useDashboardOrderStats(period: WorkbenchOrderStatsPeriod) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryKey = useMemo(
    () => dashboardQueryKey(tenantId, 'order-stats', period),
    [tenantId, period],
  );

  return useQuery({
    queryKey,
    queryFn: () => dashboard.getOrderStats({ period }),
    staleTime: 30_000,
    enabled: !!tenantId,
  });
}
