import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import type { MaterialPriceRule, MaterialPriceRuleOverride } from '../types';

export function useMaterialPriceSettings() {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'materialPriceSettings'),
    queryFn: () => dashboard.getMaterialPriceSettings(),
    staleTime: 30_000,
    enabled: !!tenantId,
  });
}

export function usePutMaterialPriceSettings() {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (materialPriceRule: MaterialPriceRule) =>
      dashboard.putMaterialPriceSettings(materialPriceRule),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'materialPriceSettings') });
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'materialPriceParentProducts') });
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'materialPriceBomMaterials') });
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'productEconomics') });
    },
  });
}

export function useMaterialPriceParentProducts(search: string) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const trimmed = search.trim();
  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'materialPriceParentProducts', trimmed || ''),
    queryFn: () => dashboard.getMaterialPriceParentProducts({ search: trimmed || undefined }),
    staleTime: 30_000,
    enabled: !!tenantId,
  });
}

export function useMaterialPriceBomMaterials(parentId: string | null) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  return useQuery({
    queryKey: dashboardQueryKey(tenantId, 'materialPriceBomMaterials', parentId ?? ''),
    queryFn: () => dashboard.getMaterialPriceBomMaterials(parentId!),
    staleTime: 30_000,
    enabled: !!tenantId && !!parentId,
  });
}

export function usePatchParentMaterialPriceDefaultRule(parentId: string | null) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (defaultRule: MaterialPriceRule | null) =>
      dashboard.patchParentMaterialPriceDefaultRule(parentId!, defaultRule),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'materialPriceParentProducts') });
      if (parentId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardQueryKey(tenantId, 'materialPriceBomMaterials', parentId),
        });
      }
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'productEconomics') });
    },
  });
}

export function usePatchBomMaterialPriceOverride(parentId: string | null) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      materialId,
      rule,
    }: {
      materialId: string;
      rule: MaterialPriceRuleOverride;
    }) => dashboard.patchBomMaterialPriceOverride(parentId!, materialId, rule),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'materialPriceParentProducts') });
      if (parentId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardQueryKey(tenantId, 'materialPriceBomMaterials', parentId),
        });
      }
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey(tenantId, 'productEconomics') });
    },
  });
}
