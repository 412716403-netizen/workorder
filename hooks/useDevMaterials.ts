import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

export const DEV_MATERIAL_QK_BASE = ['dev', 'material-records'] as const;

export function devMaterialQueryKey(styleId: string) {
  return [...DEV_MATERIAL_QK_BASE, styleId] as const;
}

export function useDevMaterials(styleId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: styleId ? devMaterialQueryKey(styleId) : [...DEV_MATERIAL_QK_BASE, 'none'],
    queryFn: () => api.devMaterial.listRecords(styleId!),
    enabled: Boolean(styleId) && enabled,
    staleTime: 15_000,
  });

  const refresh = useCallback(async () => {
    if (!styleId) return;
    await queryClient.invalidateQueries({ queryKey: devMaterialQueryKey(styleId) });
    await queryClient.invalidateQueries({ queryKey: ['psi', 'stock-snapshot'] });
  }, [queryClient, styleId]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refresh,
    refetch: query.refetch,
  };
}
