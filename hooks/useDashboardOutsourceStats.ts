import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import type { WorkbenchOrderStatsPeriod } from '../types';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';

export function useDashboardOutsourceStats(period: WorkbenchOrderStatsPeriod) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryKey = useMemo(
    () => dashboardQueryKey(tenantId, 'outsource-stats', period),
    [tenantId, period],
  );

  return useQuery({
    queryKey,
    queryFn: () => dashboard.getOutsourceStats({ period }),
    staleTime: 30_000,
    enabled: !!tenantId,
  });
}
