/**
 * Phase 4：字典类静态数据的 react-query 包装。
 *
 * 现状：`AppDataContext` 仍在登录后一次性拉 partners / products / dictionaries / warehouses 并存于全局 state；
 *      迁移路径：新建视图优先调用本文件的 useXxxQuery，逐步去掉对 useAppData().xxx 的依赖；
 *      待所有调用点完成迁移后即可从 AppDataContext 删除对应 state（首屏请求数据再下降一档）。
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type {
  Partner,
  Product,
  AppDictionaries,
  Warehouse,
  ProductCategory,
  PartnerCategory,
  GlobalNodeTemplate,
  FinanceCategory,
  FinanceAccountType,
  Worker,
  Equipment,
} from '../types';

const STATIC_STALE_MS = 60_000;

export const PARTNERS_QK = ['master', 'partners'] as const;
export const PRODUCTS_QK = ['master', 'products'] as const;
export const DICTIONARIES_QK = ['master', 'dictionaries'] as const;
export const WAREHOUSES_QK = ['master', 'warehouses'] as const;
export const PRODUCT_CATEGORIES_QK = ['master', 'product-categories'] as const;
export const PARTNER_CATEGORIES_QK = ['master', 'partner-categories'] as const;
export const GLOBAL_NODES_QK = ['master', 'global-nodes'] as const;
export const FINANCE_CATEGORIES_QK = ['master', 'finance-categories'] as const;
export const FINANCE_ACCOUNT_TYPES_QK = ['master', 'finance-account-types'] as const;
export const WORKERS_QK = ['master', 'workers'] as const;
export const EQUIPMENT_QK = ['master', 'equipment'] as const;

export function usePartnersQuery(enabled = true) {
  return useQuery({
    queryKey: PARTNERS_QK,
    queryFn: () => api.partners.list() as Promise<Partner[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function useProductsQuery(enabled = true) {
  return useQuery({
    queryKey: PRODUCTS_QK,
    queryFn: () => api.products.list() as Promise<Product[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function useDictionariesQuery(enabled = true) {
  return useQuery({
    queryKey: DICTIONARIES_QK,
    queryFn: () => api.dictionaries.list() as unknown as Promise<AppDictionaries>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function useWarehousesQuery(enabled = true) {
  return useQuery({
    queryKey: WAREHOUSES_QK,
    queryFn: () => api.settings.warehouses.list() as Promise<Warehouse[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function useProductCategoriesQuery(enabled = true) {
  return useQuery({
    queryKey: PRODUCT_CATEGORIES_QK,
    queryFn: () => api.settings.categories.list() as Promise<ProductCategory[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function usePartnerCategoriesQuery(enabled = true) {
  return useQuery({
    queryKey: PARTNER_CATEGORIES_QK,
    queryFn: () => api.settings.partnerCategories.list() as Promise<PartnerCategory[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function useGlobalNodesQuery(enabled = true) {
  return useQuery({
    queryKey: GLOBAL_NODES_QK,
    queryFn: () => api.settings.nodes.list() as Promise<GlobalNodeTemplate[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function useFinanceCategoriesQuery(enabled = true) {
  return useQuery({
    queryKey: FINANCE_CATEGORIES_QK,
    queryFn: () => api.settings.financeCategories.list() as Promise<FinanceCategory[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function useFinanceAccountTypesQuery(enabled = true) {
  return useQuery({
    queryKey: FINANCE_ACCOUNT_TYPES_QK,
    queryFn: () => api.settings.financeAccountTypes.list() as Promise<FinanceAccountType[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function useWorkersQuery(enabled = true) {
  return useQuery({
    queryKey: WORKERS_QK,
    queryFn: () => api.workers.list() as Promise<Worker[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

export function useEquipmentQuery(enabled = true) {
  return useQuery({
    queryKey: EQUIPMENT_QK,
    queryFn: () => api.equipment.list() as Promise<Equipment[]>,
    staleTime: STATIC_STALE_MS,
    enabled,
  });
}

/** 任一上述静态字典变更后，调用本函数刷新所有相关 query；mutation 完成处统一调用。 */
export function useInvalidateMasterData() {
  const qc = useQueryClient();
  return {
    invalidatePartners: () => qc.invalidateQueries({ queryKey: PARTNERS_QK }),
    invalidateProducts: () => qc.invalidateQueries({ queryKey: PRODUCTS_QK }),
    invalidateDictionaries: () => qc.invalidateQueries({ queryKey: DICTIONARIES_QK }),
    invalidateWarehouses: () => qc.invalidateQueries({ queryKey: WAREHOUSES_QK }),
    invalidateProductCategories: () => qc.invalidateQueries({ queryKey: PRODUCT_CATEGORIES_QK }),
    invalidatePartnerCategories: () => qc.invalidateQueries({ queryKey: PARTNER_CATEGORIES_QK }),
    invalidateGlobalNodes: () => qc.invalidateQueries({ queryKey: GLOBAL_NODES_QK }),
    invalidateFinanceCategories: () => qc.invalidateQueries({ queryKey: FINANCE_CATEGORIES_QK }),
    invalidateFinanceAccountTypes: () => qc.invalidateQueries({ queryKey: FINANCE_ACCOUNT_TYPES_QK }),
    invalidateWorkers: () => qc.invalidateQueries({ queryKey: WORKERS_QK }),
    invalidateEquipment: () => qc.invalidateQueries({ queryKey: EQUIPMENT_QK }),
    /** Phase 4：一次性失效全部 master 类查询，用于 tenant 切换 / 大批量导入后强制刷新 */
    invalidateAll: () => qc.invalidateQueries({ queryKey: ['master'] }),
  };
}
