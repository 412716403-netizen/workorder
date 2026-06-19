import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  BOM,
  GlobalNodeTemplate,
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductMilestoneProgress,
} from '../types';
import { normalizeDecimals } from '../contexts/formSettingsDefaults';
import { production as productionApi } from '../services/api';
import { fetchAllPages, type PaginatedLike } from '../utils/fetchAllPages';
import { buildNodeWeightEnabledMap } from '../utils/stockMaterialHelpers';
import {
  computeOrderFamilyMaterialStats,
  computeProductMaterialStats,
  resolveRootOrderIdForMaterial,
} from '../utils/computeOrderMaterialStats';
import { getOrderFamilyIds } from '../views/production-ops/types';
import { useDataIndexes } from '../views/production-ops/useDataIndexes';
import type { MatRow } from '../views/production-ops/stockMaterialPanelHelpers';

export interface UseOrderMaterialStatsParams {
  /** 工单模式必填；产品模式可与 scopeProductId 二选一 */
  orderId?: string | null;
  /** 产品模式：按成品 id 聚合物料（产品详情弹窗等无单工单上下文时） */
  scopeProductId?: string | null;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  productionLinkMode: 'order' | 'product';
  productMilestoneProgresses?: ProductMilestoneProgress[];
}

export function useOrderMaterialStats({
  orderId = null,
  scopeProductId = null,
  orders,
  products,
  boms,
  globalNodes,
  productionLinkMode,
  productMilestoneProgresses = [],
}: UseOrderMaterialStatsParams) {
  const order = useMemo(
    () => (orderId ? orders.find(o => o.id === orderId) ?? null : null),
    [orders, orderId],
  );
  const idx = useDataIndexes(orders, products, boms, globalNodes, productMilestoneProgresses);
  const nodeWeightEnabledMap = useMemo(() => buildNodeWeightEnabledMap(globalNodes), [globalNodes]);

  const effectiveProductId =
    productionLinkMode === 'product' ? (scopeProductId ?? order?.productId ?? '') : (order?.productId ?? '');

  const rootOrderId = useMemo(() => {
    if (!orderId) return '';
    return resolveRootOrderIdForMaterial(orderId, orders);
  }, [orderId, orders]);

  const familyOrderIds = useMemo(() => {
    if (productionLinkMode === 'product' && effectiveProductId) {
      const ids = new Set<string>();
      for (const o of orders) {
        if (o.productId !== effectiveProductId) continue;
        const rootId = o.parentOrderId ? resolveRootOrderIdForMaterial(o.id, orders) : o.id;
        getOrderFamilyIds(orders, rootId, idx.childrenByParentId).forEach(id => ids.add(id));
      }
      return Array.from(ids);
    }
    if (!rootOrderId) return [] as string[];
    return getOrderFamilyIds(orders, rootOrderId, idx.childrenByParentId);
  }, [productionLinkMode, effectiveProductId, orders, rootOrderId, idx.childrenByParentId]);

  const queryEnabled =
    productionLinkMode === 'product'
      ? !!effectiveProductId
      : !!orderId && familyOrderIds.length > 0;

  const stockProdQuery = useQuery({
    queryKey: ['orderDetailMaterialStats', familyOrderIds.join(','), effectiveProductId, productionLinkMode],
    enabled: queryEnabled,
    queryFn: async (): Promise<ProductionOpRecord[]> => {
      const all = await fetchAllPages<ProductionOpRecord>(
        page => {
          const params: Record<string, string> = {
            page: String(page),
            pageSize: '200',
            types: 'STOCK_OUT,STOCK_RETURN',
          };
          if (familyOrderIds.length > 0) params.orderIds = familyOrderIds.join(',');
          if (productionLinkMode === 'product' && effectiveProductId) {
            params.sourceProductIds = effectiveProductId;
          }
          return productionApi.listPage(params) as Promise<
            ProductionOpRecord[] | PaginatedLike<ProductionOpRecord>
          >;
        },
        { maxPages: 40, warnTag: 'orderDetailMaterialStats' },
      );
      return normalizeDecimals(all);
    },
    staleTime: 10_000,
  });

  const materials = useMemo((): MatRow[] => {
    const stockRecords = stockProdQuery.data ?? [];
    if (productionLinkMode === 'product') {
      if (!effectiveProductId) return [];
      return computeProductMaterialStats({
        productId: effectiveProductId,
        orders,
        idx,
        stockRecords,
        productMilestoneProgresses,
        nodeWeightEnabledMap,
      });
    }
    if (!orderId || !rootOrderId) return [];
    return computeOrderFamilyMaterialStats({
      rootOrderId,
      orders,
      productsById: idx.productsById,
      bomsById: idx.bomsById,
      bomsByParentProduct: idx.bomsByParentProduct,
      childrenByParentId: idx.childrenByParentId,
      stockRecords,
      nodeWeightEnabledMap,
    });
  }, [
    orderId,
    rootOrderId,
    stockProdQuery.data,
    productionLinkMode,
    effectiveProductId,
    orders,
    idx,
    productMilestoneProgresses,
    nodeWeightEnabledMap,
  ]);

  return {
    materials,
    isLoading: stockProdQuery.isLoading,
    isError: stockProdQuery.isError,
    rootOrderId,
    familyOrderIds,
  };
}
