import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import { parseFeaturePlugins, type FeaturePluginsConfig } from '../types';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import { useMemo } from 'react';

export function useFeaturePlugins() {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryKey = useMemo(() => dashboardQueryKey(tenantId, 'featurePlugins'), [tenantId]);

  const query = useQuery({
    queryKey,
    queryFn: () => dashboard.getFeaturePlugins(),
    staleTime: 60_000,
    enabled: !!tenantId,
  });

  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: FeaturePluginsConfig) => dashboard.updateFeaturePlugins(body),
    onSuccess: data => { qc.setQueryData(queryKey, data); },
  });

  const plugins = parseFeaturePlugins(query.data ?? null);

  function isPluginEnabled(id: string): boolean {
    return plugins[id] !== false;
  }

  return {
    plugins,
    isLoading: query.isLoading,
    isPluginEnabled,
    updatePlugins: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    refetch: query.refetch,
  };
}
