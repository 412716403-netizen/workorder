import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import type { MaterialPriceRule, MaterialPriceRuleOverride } from '../types';

export function useReportPriceParentProducts(search: string) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const trimmed = search.trim();
  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'reportPriceParentProducts', trimmed || ''),
    queryFn: () => dashboard.getReportPriceParentProducts({ search: trimmed || undefined }),
    staleTime: 30_000,
    enabled: !!tenantId,
  });
}

export function useReportPriceNodes(parentId: string | null) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'reportPriceNodes', parentId ?? ''),
    queryFn: () => dashboard.getReportPriceNodes(parentId!),
    staleTime: 30_000,
    enabled: !!tenantId && !!parentId,
  });
}

export function usePatchParentReportPriceDefaultRule(parentId: string | null) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (defaultRule: MaterialPriceRule | null) =>
      dashboard.patchParentReportPriceDefaultRule(parentId!, defaultRule),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'reportPriceParentProducts') });
      if (parentId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardQueryKey(tenantId, 'reportPriceNodes', parentId),
        });
      }
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'productEconomics') });
    },
  });
}

export function usePatchReportPriceNodeOverride(parentId: string | null) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, rule }: { nodeId: string; rule: MaterialPriceRuleOverride }) =>
      dashboard.patchReportPriceNodeOverride(parentId!, nodeId, rule),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'reportPriceParentProducts') });
      if (parentId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardQueryKey(tenantId, 'reportPriceNodes', parentId),
        });
      }
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'productEconomics') });
    },
  });
}
