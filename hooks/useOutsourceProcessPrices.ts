import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import type { MaterialPriceRule, MaterialPriceRuleOverride } from '../types';

export function useOutsourcePriceParentProducts(search: string) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const trimmed = search.trim();
  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'outsourcePriceParentProducts', trimmed || ''),
    queryFn: () => dashboard.getOutsourcePriceParentProducts({ search: trimmed || undefined }),
    staleTime: 30_000,
    enabled: !!tenantId,
  });
}

export function useOutsourcePriceNodes(parentId: string | null) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'outsourcePriceNodes', parentId ?? ''),
    queryFn: () => dashboard.getOutsourcePriceNodes(parentId!),
    staleTime: 30_000,
    enabled: !!tenantId && !!parentId,
  });
}

export function usePatchParentOutsourcePriceDefaultRule(parentId: string | null) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (defaultRule: MaterialPriceRule | null) =>
      dashboard.patchParentOutsourcePriceDefaultRule(parentId!, defaultRule),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'outsourcePriceParentProducts') });
      if (parentId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardQueryKey(tenantId, 'outsourcePriceNodes', parentId),
        });
      }
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'productEconomics') });
    },
  });
}

export function usePatchOutsourcePriceNodeOverride(parentId: string | null) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, rule }: { nodeId: string; rule: MaterialPriceRuleOverride }) =>
      dashboard.patchOutsourcePriceNodeOverride(parentId!, nodeId, rule),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'outsourcePriceParentProducts') });
      if (parentId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardQueryKey(tenantId, 'outsourcePriceNodes', parentId),
        });
      }
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'productEconomics') });
    },
  });
}
