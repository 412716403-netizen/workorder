import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

export const REWORK_MATERIAL_QK_BASE = ['production', 'rework-material-records'] as const;

export function reworkMaterialQueryKey(orderId: string) {
  return [...REWORK_MATERIAL_QK_BASE, orderId] as const;
}

export function useReworkMaterials(orderId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: orderId ? reworkMaterialQueryKey(orderId) : [...REWORK_MATERIAL_QK_BASE, 'none'],
    queryFn: () => api.production.listReworkMaterialRecords(orderId!),
    enabled: Boolean(orderId) && enabled,
    staleTime: 15_000,
  });

  const refresh = useCallback(async () => {
    if (!orderId) return;
    await queryClient.invalidateQueries({ queryKey: reworkMaterialQueryKey(orderId) });
    await queryClient.invalidateQueries({ queryKey: ['psi', 'stock-snapshot'] });
  }, [queryClient, orderId]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refresh,
    refetch: query.refetch,
  };
}
