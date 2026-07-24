import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Package, ScrollText, X } from 'lucide-react';
import type {
  AppDictionaries,
  BOM,
  GlobalNodeTemplate,
  Product,
  ProductCategory,
  ProductMilestoneProgress,
  ProductionOpRecord,
  ProductionOrder,
  PsiRecord,
  Warehouse,
} from '../../types';
import { ModalPortal } from '../../components/ModalPortal';
import { useOrderMaterialStats } from '../../hooks/useOrderMaterialStats';
import { STOCK_SNAPSHOT_QK_BASE } from '../../hooks/useStockSnapshot';
import { buildOrderMaterialReturnable, toOrderCenterMaterialStats } from '../../utils/orderMaterialReturnable';
import { outlineToolbarButtonClass, primaryToolbarButtonClass } from '../../styles/uiDensity';
import { MaterialStatsTable } from '../production-ops/MaterialStatsTable';
import type { StockFlowInitialSeed } from '../production-ops/stockFlowListUtils';
import MaterialIssueModal from './MaterialIssueModal';
import OrderMaterialReturnModal from './OrderMaterialReturnModal';

export interface OrderMaterialModalProps {
  orderId: string | null;
  forProduct: { productId: string; orders: ProductionOrder[] } | null;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  warehouses: Warehouse[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  productionLinkMode: 'order' | 'product';
  productMilestoneProgresses?: ProductMilestoneProgress[];
  categories?: ProductCategory[];
  psiRecords?: PsiRecord[];
  canViewMaterialFlow?: boolean;
  onOpenMaterialFlow?: (seed: StockFlowInitialSeed) => void;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
  userPermissions?: string[];
  tenantRole?: string;
}

const OrderMaterialModal: React.FC<OrderMaterialModalProps> = ({
  orderId,
  forProduct,
  orders,
  products,
  boms,
  warehouses,
  globalNodes,
  dictionaries,
  productionLinkMode,
  productMilestoneProgresses = [],
  categories = [],
  psiRecords = [],
  canViewMaterialFlow = false,
  onOpenMaterialFlow,
  onAddRecord,
  onAddRecordBatch,
  onClose,
  userPermissions,
  tenantRole,
}) => {
  const queryClient = useQueryClient();
  const [opMode, setOpMode] = useState<'issue' | 'return' | null>(null);

  const scopeProductId = forProduct?.productId ?? null;
  const effectiveOrderId = forProduct ? null : orderId;
  const statsLinkMode = forProduct ? 'product' : productionLinkMode;

  const { materials, isLoading, isError, familyOrderIds, stockRecords } = useOrderMaterialStats({
    orderId: effectiveOrderId,
    scopeProductId,
    orders,
    products,
    boms,
    globalNodes,
    productionLinkMode: statsLinkMode,
    productMilestoneProgresses,
  });

  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const returnable = useMemo(
    () => buildOrderMaterialReturnable(stockRecords, productsById),
    [stockRecords, productsById],
  );
  const canOpenReturn = returnable.length > 0;

  /** 工单中心弹窗：领退仅本厂往来；报工耗材保留；不含外协/返工/开发 */
  const centerMaterials = useMemo(
    () => toOrderCenterMaterialStats(materials, stockRecords),
    [materials, stockRecords],
  );

  const order = useMemo(
    () => (orderId && !forProduct ? orders.find(o => o.id === orderId) ?? null : null),
    [orderId, forProduct, orders],
  );
  const finishedProduct = useMemo(
    () => (forProduct ? products.find(p => p.id === forProduct.productId) : null),
    [forProduct, products],
  );

  const titleSubtitle = forProduct
    ? `${finishedProduct?.name ?? '—'} · 共 ${forProduct.orders.length} 条工单`
    : `${order?.orderNumber ?? '—'} — ${
        products.find(p => p.id === order?.productId)?.name ?? order?.productName ?? ''
      }`;

  const refreshStats = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['orderDetailMaterialStats'] }),
      queryClient.invalidateQueries({ queryKey: ['materialIssueStockProd'] }),
      queryClient.invalidateQueries({ queryKey: STOCK_SNAPSHOT_QK_BASE }),
    ]);
  }, [queryClient]);

  const handleOpenMaterialFlow = () => {
    if (!onOpenMaterialFlow) return;
    /** 流水仅工单中心本厂领退（领料发出 / 生产退料），不含外协与返工 */
    const onlyBizTypes = ['ISSUE_INTERNAL', 'RETURN_INTERNAL'] as const;
    if (forProduct || productionLinkMode === 'product') {
      const pid = forProduct?.productId ?? order?.productId ?? '';
      const pname =
        finishedProduct?.name ?? products.find(p => p.id === pid)?.name ?? '';
      onOpenMaterialFlow({
        sourceProductId: pid || undefined,
        productKeyword: pname || undefined,
        onlyBizTypes: [...onlyBizTypes],
      });
      return;
    }
    if (!orderId) return;
    const ids = familyOrderIds.length > 0 ? familyOrderIds : [orderId];
    onOpenMaterialFlow({
      orderIds: ids.join(','),
      orderKeyword: order?.orderNumber ?? '',
      onlyBizTypes: [...onlyBizTypes],
    });
  };

  if (!orderId && !forProduct) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
        <div
          className="relative z-10 bg-white w-full max-w-4xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[min(92vh,960px)]"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                {forProduct ? '生产物料（关联产品）' : '生产物料'}
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">{titleSubtitle}</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-400">
                仅统计工单中心本厂领退与报工耗材；结余 = 净领用 − 报工耗材
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpMode('issue')}
                  className={primaryToolbarButtonClass}
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  领料
                </button>
                <button
                  type="button"
                  disabled={!canOpenReturn}
                  title={!canOpenReturn ? '暂无可退净领用' : undefined}
                  onClick={() => setOpMode('return')}
                  className={`${outlineToolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  退料
                </button>
                {canViewMaterialFlow && onOpenMaterialFlow ? (
                  <button type="button" onClick={handleOpenMaterialFlow} className={outlineToolbarButtonClass}>
                    <ScrollText className="h-3.5 w-3.5" />
                    流水
                  </button>
                ) : null}
              </div>
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
                  materials={centerMaterials}
                  selecting={false}
                  compact
                  selectedIds={new Set()}
                  onSelectAll={() => {}}
                  onToggleSelect={() => {}}
                  productsById={productsById}
                  categoryMap={categoryMap}
                  emptyMessage={
                    forProduct || productionLinkMode === 'product'
                      ? '该产品暂无本厂领退或报工耗材'
                      : '该工单暂无本厂领退或报工耗材'
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {opMode === 'issue' ? (
        <MaterialIssueModal
          orderId={forProduct ? null : orderId}
          forProduct={forProduct}
          orders={orders}
          products={products}
          boms={boms}
          warehouses={warehouses}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          productionLinkMode={productionLinkMode}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onClose={() => {
            setOpMode(null);
            void refreshStats();
          }}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          categories={categories}
          psiRecords={psiRecords}
        />
      ) : null}

      {opMode === 'return' ? (
        <OrderMaterialReturnModal
          orderId={forProduct ? null : orderId}
          sourceProductId={forProduct?.productId ?? null}
          titleLabel={forProduct ? '生产退料（关联产品）' : '生产退料'}
          subtitle={titleSubtitle}
          returnable={returnable}
          warehouses={warehouses}
          products={products}
          categories={categories}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onClose={() => setOpMode(null)}
          onSaved={async () => {
            await refreshStats();
            setOpMode(null);
          }}
        />
      ) : null}
    </ModalPortal>
  );
};

export default React.memo(OrderMaterialModal);
