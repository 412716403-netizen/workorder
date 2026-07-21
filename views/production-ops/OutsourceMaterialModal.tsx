import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Package, ScrollText, X } from 'lucide-react';
import { toast } from 'sonner';
import type {
  BOM,
  GlobalNodeTemplate,
  MaterialFormSettings,
  Product,
  ProductCategory,
  ProductionOpRecord,
  ProductionOrder,
  PsiRecord,
  Warehouse,
} from '../../types';
import { ModalPortal } from '../../components/ModalPortal';
import { useAuth } from '../../contexts/AuthContext';
import { outlineToolbarButtonClass, primaryToolbarButtonClass } from '../../styles/uiDensity';
import { formatMaterialQtyDisplay } from '../../utils/formatMaterialQtyDisplay';
import {
  buildOutsourceMaterialSummary,
  hasOutsourceMaterialDispatch,
  listOutsourceDispatchPartners,
} from '../../utils/outsourceMaterialStats';
import {
  readWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';
import { getOrderFamilyIds, type StockDocDetail } from './types';
import OutsourceMaterialDispatchModal from './OutsourceMaterialDispatchModal';
import OutsourceMaterialReturnModal from './OutsourceMaterialReturnModal';
import type { StockFlowInitialSeed } from './stockFlowListUtils';

export interface OutsourceMaterialModalProps {
  productionLinkMode: 'order' | 'product';
  /** 工单模式 */
  orderId: string | null;
  /** 关联产品模式 */
  productId: string | null;
  /** 卡片上外协加工厂名（发出弹窗下拉） */
  partnerOptions: string[];
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  records: ProductionOpRecord[];
  warehouses: Warehouse[];
  categories?: ProductCategory[];
  materialFormSettings?: MaterialFormSettings;
  psiRecords?: PsiRecord[];
  canViewMaterialFlow?: boolean;
  onOpenMaterialFlow?: (seed: StockFlowInitialSeed) => void;
  onAddRecord: (record: ProductionOpRecord) => void | Promise<ProductionOpRecord | null | void>;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<ProductionOpRecord[] | void>;
  onAfterMatDocSaved?: (detail: StockDocDetail) => void;
  onClose: () => void;
}

const thClass =
  'px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle';
const tdNumClass =
  'px-4 py-2.5 text-right text-xs font-semibold tabular-nums align-middle whitespace-nowrap';

const OutsourceMaterialModal: React.FC<OutsourceMaterialModalProps> = ({
  productionLinkMode,
  orderId,
  productId,
  partnerOptions,
  orders,
  products,
  boms,
  globalNodes,
  records,
  warehouses,
  categories = [],
  materialFormSettings,
  psiRecords = [],
  canViewMaterialFlow = false,
  onOpenMaterialFlow,
  onAddRecord,
  onAddRecordBatch,
  onAfterMatDocSaved,
  onClose,
}) => {
  const { tenantCtx, userId } = useAuth();
  const [opMode, setOpMode] = useState<'dispatch' | 'return' | null>(null);

  const [matDispatchPartner, setMatDispatchPartner] = useState('');
  const [matDispatchWarehouseId, setMatDispatchWarehouseId] = useState('');
  const [matDispatchQty, setMatDispatchQty] = useState<Record<string, number>>({});
  const [matReturnPartner, setMatReturnPartner] = useState('');
  const [matReturnWarehouseId, setMatReturnWarehouseId] = useState('');
  const [matReturnQty, setMatReturnQty] = useState<Record<string, number>>({});
  const [matReturnPartnerOptions, setMatReturnPartnerOptions] = useState<string[]>([]);

  const isProductMode = productionLinkMode === 'product';
  const order = !isProductMode && orderId ? orders.find(o => o.id === orderId) : undefined;
  const finishedProductId = isProductMode ? productId : order?.productId;
  const finishedProduct = finishedProductId ? products.find(p => p.id === finishedProductId) : undefined;

  const scope = useMemo(
    () => ({
      productionLinkMode,
      orderId: isProductMode ? null : orderId,
      productId: isProductMode ? productId : null,
      orders,
    }),
    [productionLinkMode, isProductMode, orderId, productId, orders],
  );

  const productsById = useMemo(
    () => new Map(products.map(p => [p.id, { name: p.name, sku: p.sku }])),
    [products],
  );

  const summary = useMemo(
    () =>
      buildOutsourceMaterialSummary(records, productsById, scope, {
        finishedProductId,
        products,
        boms,
      }),
    [records, productsById, scope, finishedProductId, products, boms],
  );

  const canOpenReturn = hasOutsourceMaterialDispatch(records, scope);

  const titleSubtitle = isProductMode
    ? `${finishedProduct?.name ?? '—'} · 外协物料`
    : `${order?.orderNumber ?? '—'} — ${finishedProduct?.name ?? order?.productName ?? ''}`;

  const openDispatch = () => {
    const unique = [...new Set(partnerOptions.filter(Boolean))];
    setMatDispatchPartner(unique.length === 1 ? (unique[0] ?? '') : '');
    setMatDispatchWarehouseId(
      resolvePreferredSingleWarehouse(
        warehouses,
        readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.OUTSOURCE_MAT_DISPATCH),
        warehouses[0]?.id ?? '',
      ) || '',
    );
    setMatDispatchQty({});
    setOpMode('dispatch');
  };

  const openReturn = () => {
    const partners = listOutsourceDispatchPartners(records, scope);
    if (partners.length === 0) {
      toast.warning('该卡片暂无外发记录，无法退回');
      return;
    }
    setMatReturnPartnerOptions(partners);
    setMatReturnPartner(partners.length === 1 ? (partners[0] ?? '') : '');
    setMatReturnWarehouseId(
      resolvePreferredSingleWarehouse(
        warehouses,
        readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.OUTSOURCE_MAT_RETURN),
        warehouses[0]?.id ?? '',
      ) || '',
    );
    setMatReturnQty({});
    setOpMode('return');
  };

  const handleOpenMaterialFlow = () => {
    if (!onOpenMaterialFlow) return;
    const onlyBizTypes = ['ISSUE_OUTSOURCE', 'RETURN_OUTSOURCE'] as const;
    if (isProductMode) {
      onOpenMaterialFlow({
        sourceProductId: productId || undefined,
        productKeyword: finishedProduct?.name || undefined,
        onlyBizTypes: [...onlyBizTypes],
      });
      return;
    }
    if (!orderId) return;
    const ids = getOrderFamilyIds(orders, orderId);
    onOpenMaterialFlow({
      orderIds: (ids.length > 0 ? ids : [orderId]).join(','),
      orderKeyword: order?.orderNumber ?? '',
      onlyBizTypes: [...onlyBizTypes],
    });
  };

  if (!orderId && !productId) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[76] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
        <div
          className="relative z-10 bg-white w-full max-w-4xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[min(92vh,960px)]"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                {isProductMode ? '外协物料（关联产品）' : '外协物料'}
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
                结余 = 净外发 − 交货耗材（外协已收回 × BOM）
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={openDispatch} className={primaryToolbarButtonClass}>
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  物料外发
                </button>
                <button
                  type="button"
                  disabled={!canOpenReturn}
                  title={!canOpenReturn ? '暂无外发记录' : undefined}
                  onClick={openReturn}
                  className={`${outlineToolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  物料退回
                </button>
                {canViewMaterialFlow && onOpenMaterialFlow ? (
                  <button type="button" onClick={handleOpenMaterialFlow} className={outlineToolbarButtonClass}>
                    <ScrollText className="h-3.5 w-3.5" />
                    流水
                  </button>
                ) : null}
              </div>
            </div>

            {summary.length === 0 ? (
              <p className="py-6 text-center text-xs font-medium text-slate-400">暂无外协领退料记录</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-[28%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className={`${thClass} text-left`}>物料</th>
                      <th className={`${thClass} text-right`}>累计外发</th>
                      <th className={`${thClass} text-right`}>累计退回</th>
                      <th className={`${thClass} text-right`}>净外发</th>
                      <th className={`${thClass} text-right`}>交货耗材</th>
                      <th className={`${thClass} text-right`}>结余</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {summary.map(row => (
                      <tr key={row.productId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5 align-middle min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800" title={row.productName}>
                            {row.productName}
                          </p>
                          {row.productSku ? (
                            <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400" title={row.productSku}>
                              {row.productSku}
                            </p>
                          ) : null}
                        </td>
                        <td className={`${tdNumClass} text-slate-700`}>{formatMaterialQtyDisplay(row.issuedQty)}</td>
                        <td className={`${tdNumClass} text-slate-700`}>{formatMaterialQtyDisplay(row.returnedQty)}</td>
                        <td className={`${tdNumClass} text-indigo-600`}>{formatMaterialQtyDisplay(row.netQty)}</td>
                        <td className={`${tdNumClass} text-amber-700`}>{formatMaterialQtyDisplay(row.consumableQty)}</td>
                        <td className={`${tdNumClass} text-slate-800`}>{formatMaterialQtyDisplay(row.balanceQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {opMode === 'dispatch' ? (
        <OutsourceMaterialDispatchModal
          productionLinkMode={productionLinkMode}
          matDispatchOrderId={isProductMode ? null : orderId}
          matDispatchProductId={isProductMode ? productId : null}
          matDispatchPartnerOptions={partnerOptions}
          matDispatchPartner={matDispatchPartner}
          setMatDispatchPartner={setMatDispatchPartner}
          matDispatchWarehouseId={matDispatchWarehouseId}
          setMatDispatchWarehouseId={setMatDispatchWarehouseId}
          matDispatchQty={matDispatchQty}
          setMatDispatchQty={setMatDispatchQty}
          orders={orders}
          products={products}
          boms={boms}
          globalNodes={globalNodes}
          records={records}
          warehouses={warehouses}
          materialFormSettings={materialFormSettings}
          categories={categories}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onAfterMatDocSaved={onAfterMatDocSaved}
          onClose={() => setOpMode(null)}
          psiRecords={psiRecords}
        />
      ) : null}

      {opMode === 'return' ? (
        <OutsourceMaterialReturnModal
          productionLinkMode={productionLinkMode}
          matReturnOrderId={isProductMode ? null : orderId}
          matReturnProductId={isProductMode ? productId : null}
          matReturnPartnerOptions={matReturnPartnerOptions}
          matReturnPartner={matReturnPartner}
          setMatReturnPartner={setMatReturnPartner}
          matReturnWarehouseId={matReturnWarehouseId}
          setMatReturnWarehouseId={setMatReturnWarehouseId}
          matReturnQty={matReturnQty}
          setMatReturnQty={setMatReturnQty}
          orders={orders}
          products={products}
          boms={boms}
          records={records}
          warehouses={warehouses}
          materialFormSettings={materialFormSettings}
          categories={categories}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onAfterMatDocSaved={onAfterMatDocSaved}
          onClose={() => setOpMode(null)}
          psiRecords={psiRecords}
        />
      ) : null}
    </ModalPortal>
  );
};

export default React.memo(OutsourceMaterialModal);
