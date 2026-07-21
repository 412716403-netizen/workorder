import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Package, ScrollText, X } from 'lucide-react';
import type {
  BOM,
  GlobalNodeTemplate,
  Product,
  ProductCategory,
  ProductionOrder,
  Warehouse,
} from '../../types';
import { ModalPortal } from '../../components/ModalPortal';
import { useReworkMaterials } from '../../hooks/useReworkMaterials';
import { computeReworkBomMaterials } from '../../utils/reworkBomMaterials';
import { outlineToolbarButtonClass, primaryToolbarButtonClass } from '../../styles/uiDensity';
import { getOrderFamilyIds } from './types';
import ReworkMaterialIssueModal from './ReworkMaterialIssueModal';
import ReworkMaterialReturnModal from './ReworkMaterialReturnModal';
import type { StockFlowInitialSeed } from './stockFlowListUtils';

export interface ReworkMaterialModalProps {
  orderId: string;
  orders: ProductionOrder[];
  products: Product[];
  categories?: ProductCategory[];
  warehouses: Warehouse[];
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  /** 是否可看生产物料「领料退料流水」（production:material_records:view） */
  canViewMaterialFlow?: boolean;
  /** 打开生产物料「领料退料流水」弹窗（与工单详情页「物料流水」同一入口，预填本工单） */
  onOpenMaterialFlow?: (seed: StockFlowInitialSeed) => void;
  onClose: () => void;
}

const thClass =
  'px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle';
const tdNumClass =
  'px-4 py-2.5 text-right text-xs font-semibold tabular-nums align-middle whitespace-nowrap';

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return String(Math.round(n * 100) / 100);
}

const ReworkMaterialModal: React.FC<ReworkMaterialModalProps> = ({
  orderId,
  orders,
  products,
  categories = [],
  warehouses,
  boms,
  globalNodes,
  canViewMaterialFlow = false,
  onOpenMaterialFlow,
  onClose,
}) => {
  const [opMode, setOpMode] = useState<'issue' | 'return' | null>(null);
  const { data, isLoading, refresh } = useReworkMaterials(orderId);

  const order = orders.find(o => o.id === orderId);
  const product = order ? products.find(p => p.id === order.productId) : undefined;
  const productName = product?.name ?? order?.productName ?? '';

  const bomMaterials = useMemo(
    () => (order ? computeReworkBomMaterials(order, products, boms, globalNodes) : []),
    [order, products, boms, globalNodes],
  );

  if (!order) return null;

  const summary = data?.summary ?? [];
  const canOpenIssue = bomMaterials.length > 0;
  const canOpenReturn = data?.canReturn ?? false;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[76] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
        <div
          className="relative z-10 bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[min(92vh,960px)]"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" /> 返工物料
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">{order.orderNumber} — {productName}</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-400">本厂领料 / 退料，关联当前工单 BOM</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canOpenIssue}
                  title={!canOpenIssue ? '该工单未配置 BOM 物料' : undefined}
                  onClick={() => setOpMode('issue')}
                  className={`${primaryToolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  返工领料
                </button>
                <button
                  type="button"
                  disabled={!canOpenReturn}
                  title={!canOpenReturn ? '暂无可退净领用' : undefined}
                  onClick={() => setOpMode('return')}
                  className={`${outlineToolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  返工退料
                </button>
                {canViewMaterialFlow && onOpenMaterialFlow ? (
                  <button
                    type="button"
                    onClick={() => {
                      const ids = getOrderFamilyIds(orders, orderId);
                      onOpenMaterialFlow({
                        orderIds: (ids.length > 0 ? ids : [orderId]).join(','),
                        orderKeyword: order.orderNumber ?? '',
                        onlyBizTypes: ['ISSUE_REWORK', 'RETURN_REWORK'],
                      });
                    }}
                    className={outlineToolbarButtonClass}
                  >
                    <ScrollText className="h-3.5 w-3.5" />
                    流水
                  </button>
                ) : null}
              </div>
            </div>

            {isLoading && !data ? (
              <p className="py-6 text-center text-xs font-medium text-slate-400">加载中…</p>
            ) : summary.length === 0 ? (
              <p className="py-6 text-center text-xs font-medium text-slate-400">
                {bomMaterials.length === 0 ? '该工单未配置 BOM 物料' : '暂无领退料记录'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full min-w-[520px] table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-[46%]" />
                    <col className="w-[18%]" />
                    <col className="w-[18%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className={`${thClass} text-left`}>物料</th>
                      <th className={`${thClass} text-right`}>累计领料</th>
                      <th className={`${thClass} text-right`}>累计退料</th>
                      <th className={`${thClass} text-right`}>净领用</th>
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
                        <td className={`${tdNumClass} text-slate-700`}>{formatQty(row.issuedQty)}</td>
                        <td className={`${tdNumClass} text-slate-700`}>{formatQty(row.returnedQty)}</td>
                        <td className={`${tdNumClass} text-indigo-600`}>{formatQty(row.netQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {opMode === 'issue' && data && (
        <ReworkMaterialIssueModal
          order={order}
          productName={productName}
          bomMaterials={bomMaterials}
          data={data}
          products={products}
          categories={categories}
          warehouses={warehouses}
          onClose={() => setOpMode(null)}
          onSaved={async () => {
            await refresh();
            setOpMode(null);
          }}
        />
      )}

      {opMode === 'return' && data && (
        <ReworkMaterialReturnModal
          order={order}
          productName={productName}
          data={data}
          warehouses={warehouses}
          products={products}
          categories={categories}
          onClose={() => setOpMode(null)}
          onSaved={async () => {
            await refresh();
            setOpMode(null);
          }}
        />
      )}
    </ModalPortal>
  );
};

export default React.memo(ReworkMaterialModal);
