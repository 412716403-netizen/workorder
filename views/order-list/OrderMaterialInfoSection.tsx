import React, { useMemo } from 'react';
import { ArrowUpFromLine, History, Loader2, ScrollText } from 'lucide-react';
import type { BOM, GlobalNodeTemplate, Product, ProductCategory, ProductionOrder, ProductMilestoneProgress } from '../../types';
import { MaterialStatsTable } from '../production-ops/MaterialStatsTable';
import { useOrderMaterialStats } from '../../hooks/useOrderMaterialStats';
import type { StockFlowInitialSeed } from '../production-ops/stockFlowListUtils';

export type { StockFlowInitialSeed };

export interface OrderMaterialInfoSectionProps {
  orderId?: string;
  /** 产品模式无单工单上下文时（如产品组详情） */
  scopeProductId?: string;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  categories?: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  productionLinkMode: 'order' | 'product';
  productMilestoneProgresses?: ProductMilestoneProgress[];
  canViewMaterialFlow?: boolean;
  onOpenMaterialFlow?: (seed: StockFlowInitialSeed) => void;
}

const OrderMaterialInfoSection: React.FC<OrderMaterialInfoSectionProps> = ({
  orderId,
  scopeProductId,
  orders,
  products,
  boms,
  categories = [],
  globalNodes,
  productionLinkMode,
  productMilestoneProgresses = [],
  canViewMaterialFlow = false,
  onOpenMaterialFlow,
}) => {
  const order = useMemo(
    () => (orderId ? orders.find(o => o.id === orderId) ?? null : null),
    [orderId, orders],
  );
  const scopeProduct = useMemo(
    () => (scopeProductId ? products.find(p => p.id === scopeProductId) ?? null : null),
    [scopeProductId, products],
  );

  const { materials, isLoading, isError, familyOrderIds } = useOrderMaterialStats({
    orderId: orderId ?? null,
    scopeProductId: scopeProductId ?? null,
    orders,
    products,
    boms,
    globalNodes,
    productionLinkMode,
    productMilestoneProgresses,
  });

  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const emptyMessage =
    productionLinkMode === 'product'
      ? '该产品暂无 BOM 物料，请先在产品中配置 BOM'
      : '该工单暂无 BOM 物料，请先在产品中配置 BOM';

  const handleOpenMaterialFlow = () => {
    if (!onOpenMaterialFlow) return;
    if (productionLinkMode === 'product') {
      const pid = scopeProductId ?? order?.productId ?? '';
      const pname = scopeProduct?.name ?? products.find(p => p.id === pid)?.name ?? '';
      onOpenMaterialFlow({
        sourceProductId: pid || undefined,
        productKeyword: pname || undefined,
      });
      return;
    }
    if (!orderId) return;
    const ids = familyOrderIds.length > 0 ? familyOrderIds : [orderId];
    onOpenMaterialFlow({
      orderIds: ids.join(','),
      orderKeyword: order?.orderNumber ?? '',
    });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ArrowUpFromLine className="w-3.5 h-3.5" /> 生产物料
          </h4>
          {productionLinkMode === 'product' ? (
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              产品维度聚合（含本产品下多张工单的领退料与理论耗材）
            </p>
          ) : null}
        </div>
        {canViewMaterialFlow && onOpenMaterialFlow ? (
          <button
            type="button"
            onClick={handleOpenMaterialFlow}
            className="inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
          >
            <ScrollText className="w-3.5 h-3.5" /> 物料流水
          </button>
        ) : null}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载物料数据…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 py-8 text-center text-sm text-rose-600">
          物料数据加载失败，请稍后重试
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
          <MaterialStatsTable
            materials={materials}
            selecting={false}
            compact
            selectedIds={new Set()}
            onSelectAll={() => {}}
            onToggleSelect={() => {}}
            productsById={productsById}
            categoryMap={categoryMap}
            emptyMessage={emptyMessage}
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(OrderMaterialInfoSection);
