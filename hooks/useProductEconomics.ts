import { useQuery } from '@tanstack/react-query';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import type { ProductMaterialCostMode, WorkbenchPeriodFilter } from '../types';
import { isValidWorkbenchCustomRange, workbenchPeriodFilterQueryKey } from '../types';

export type { WorkbenchPeriodFilter } from '../types';

export function useProductEconomics(
  filter?: WorkbenchPeriodFilter,
  materialCostMode?: ProductMaterialCostMode,
) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const queryEnabled =
    !!tenantId
    && (filter?.mode !== 'custom'
      || isValidWorkbenchCustomRange(filter.startDate, filter.endDate));

  return useQuery({
    queryKey: dashboardQueryKey(
      tenantId,
      'productEconomics',
      materialCostMode ?? 'tenant_default',
      filter ? workbenchPeriodFilterQueryKey(filter) : 'all',
    ),
    queryFn: () => {
      const modeParam = materialCostMode ? { materialCostMode } : {};
      if (!filter) return dashboard.getProductEconomics(modeParam);
      if (filter.mode === 'custom') {
        return dashboard.getProductEconomics({
          startDate: filter.startDate,
          endDate: filter.endDate,
          ...modeParam,
        });
      }
      return dashboard.getProductEconomics({ period: filter.period, ...modeParam });
    },
    staleTime: 60_000,
    enabled: queryEnabled,
  });
}

export function useProductEconomicsDetail(
  productId: string | null,
  materialCostMode?: ProductMaterialCostMode,
) {
  const { tenantCtx } = useAuth();
  const tenantId = tenantCtx?.tenantId;

  return useQuery({
    queryKey: dashboardQueryKey(
      tenantId,
      'productEconomics',
      'detail',
      materialCostMode ?? 'tenant_default',
      productId ?? '',
    ),
    queryFn: () => dashboard.getProductEconomicsDetail(productId!, materialCostMode),
    staleTime: 60_000,
    enabled: !!tenantId && !!productId,
  });
}
