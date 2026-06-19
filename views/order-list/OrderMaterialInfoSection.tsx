import React, { useMemo } from 'react';
import { ArrowUpFromLine, Loader2 } from 'lucide-react';
import type { BOM, GlobalNodeTemplate, Product, ProductCategory, ProductionOrder, ProductMilestoneProgress } from '../../types';
import { MaterialStatsTable } from '../production-ops/MaterialStatsTable';
import { useOrderMaterialStats } from '../../hooks/useOrderMaterialStats';

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
}) => {
  const { materials, isLoading, isError } = useOrderMaterialStats({
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

  return (
    <div>
      <div className="mb-3">
        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <ArrowUpFromLine className="w-3.5 h-3.5" /> 生产物料
        </h4>
        {productionLinkMode === 'product' ? (
          <p className="mt-1 text-[11px] font-medium text-slate-500">
            产品维度聚合（含本产品下多张工单的领退料与理论耗材）
          </p>
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
