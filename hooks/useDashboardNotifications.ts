import { useQuery } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import { useMemo } from 'react';

const REFETCH_MS = 60_000;

export function useDashboardNotifications(limit = 8) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryKey = useMemo(
    () => dashboardQueryKey(tenantId, 'notifications'),
    [tenantId],
  );

  return useQuery({
    queryKey,
    queryFn: () => dashboard.getNotifications({ limit }),
    staleTime: 30_000,
    refetchInterval: REFETCH_MS,
    enabled: !!tenantId,
  });
}
