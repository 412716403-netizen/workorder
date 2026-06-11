import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import type { WorkbenchOrderStatsPeriod } from '../types';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';

export function useDashboardReworkStats(period: WorkbenchOrderStatsPeriod) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryKey = useMemo(
    () => dashboardQueryKey(tenantId, 'rework-stats', period),
    [tenantId, period],
  );

  return useQuery({
    queryKey,
    queryFn: () => dashboard.getReworkStats({ period }),
    staleTime: 30_000,
    enabled: !!tenantId,
  });
}
