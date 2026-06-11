import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';

export function useDashboardReworkStatsSettings() {
  const qc = useQueryClient();
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const settingsKey = useMemo(
    () => dashboardQueryKey(tenantId, 'rework-stats-settings'),
    [tenantId],
  );

  const query = useQuery({
    queryKey: settingsKey,
    queryFn: () => dashboard.getReworkStatsSettings(),
    staleTime: 30_000,
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => dashboard.saveReworkStatsSettings(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKey });
      void qc.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'rework-stats') });
      toast.success('工序展示已保存');
    },
    onError: (e: Error) => toast.error(e.message || '保存失败'),
  });

  return {
    isLoading: query.isLoading,
    selectedIds: query.data?.selected ?? [],
    nodes: query.data?.nodes ?? [],
    defaults: query.data?.defaults ?? [],
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
  };
}
