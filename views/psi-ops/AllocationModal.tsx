import React, { useMemo } from 'react';
import { X, PackageCheck } from 'lucide-react';
import { Product, Warehouse, AppDictionaries } from '../../types';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { effectiveAllocatedQuantity } from '../../utils/psiAllocationDisplay';

interface AllocationModalData {
  docNumber: string;
  lineGroupId: string;
  product: Product;
  grp: any[];
}

interface AllocationModalProps {
  allocationModal: AllocationModalData;
  allocationQuantities: number | Record<string, number>;
  allocationWarehouseId: string;
  onQuantityChange: (value: number | Record<string, number>) => void;
  onWarehouseIdChange: (value: string) => void;
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  recordsList: any[];
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  /** 配货确定且已写入记录后回调，用于记忆出库仓 */
  onCommittedWarehouse?: (warehouseId: string) => void;
  onClose: () => void;
}

const AllocationModal: React.FC<AllocationModalProps> = ({
  allocationModal,
  allocationQuantities,
  allocationWarehouseId,
  onQuantityChange,
  onWarehouseIdChange,
  warehouses,
  dictionaries,
  recordsList,
  onReplaceRecords,
  onCommittedWarehouse,
  onClose,
}) => {
  const allocationMatrixProduct = useMemo((): Product | null => {
    const p = allocationModal.product;
    if (!p?.variants?.length) return null;
    const grpVariantIds = new Set(allocationModal.grp.map((i: { variantId?: string }) => i.variantId).filter(Boolean) as string[]);
    const variants = p.variants.filter(v => grpVariantIds.has(v.id));
    if (variants.length === 0) return null;
    return { ...p, variants, colorIds: undefined, sizeIds: undefined };
  }, [allocationModal.product, allocationModal.grp]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-indigo-500" />
            <h3 className="text-base font-black text-slate-800">配货</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-auto flex-1 min-h-0">
          <p className="text-sm text-slate-600">
            <span className="font-bold text-slate-800">{allocationModal.product?.name}</span>
            <span className="text-slate-400 ml-1">· 单号 {allocationModal.docNumber}</span>
          </p>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">配货仓库（出库仓库）</label>
            <select
              value={allocationWarehouseId}
              onChange={e => onWarehouseIdChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">请选择仓库...</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          {(() => {
            const orderTotal = allocationModal.grp.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
            const displayAllocatedTotal = allocationModal.grp.reduce(
              (s: number, i: any) => s + effectiveAllocatedQuantity(i.allocatedQuantity, i.shippedQuantity),
              0,
            );
            const gapTotal = Math.max(0, orderTotal - displayAllocatedTotal);
            return (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="text-slate-500">订单数量：<strong className="text-slate-800">{orderTotal.toLocaleString()}</strong></span>
                <span className="text-slate-500">已配货数量：<strong className="text-slate-700">{displayAllocatedTotal.toLocaleString()}</strong></span>
                <span className="text-slate-500">本次剩余待配：<strong className="text-indigo-600">{gapTotal.toLocaleString()}</strong></span>
              </div>
            );
          })()}
          {allocationModal.grp.some((i: { variantId?: string }) => i.variantId) ? (
            allocationMatrixProduct ? (
              <div className="space-y-2 overflow-auto">
                <VariantQtyMatrixInputs
                  product={allocationMatrixProduct}
                  dictionaries={dictionaries}
                  quantities={typeof allocationQuantities === 'object' ? allocationQuantities : {}}
                  onVariantQtyChange={(variantId, qty) => {
                    if (typeof allocationQuantities !== 'object') return;
                    onQuantityChange({ ...allocationQuantities, [variantId]: qty });
                  }}
                />
              </div>
            ) : null
          ) : (
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">本次配货数量</label>
              <input
                type="number"
                min={0}
                value={typeof allocationQuantities === 'number' ? allocationQuantities : 0}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  onQuantityChange(isNaN(v) ? 0 : v);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="本次配货数量"
              />
            </div>
          )}
        </div>
        <div className="px-6 py-5 border-t border-slate-100 flex justify-end gap-4 shrink-0 bg-slate-50/50">
          <button type="button" onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 rounded-xl hover:bg-white border border-slate-200 transition-colors">
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (!onReplaceRecords) { onClose(); return; }
              if (!allocationWarehouseId) return;
              const docRecords = recordsList.filter((r: any) => r.type === 'SALES_ORDER' && r.docNumber === allocationModal.docNumber);
              const newRecords = docRecords.map((r: any) => {
                const inGrp = allocationModal.grp.find((g: any) => g.id === r.id);
                if (!inGrp) return r;
                const remaining = typeof allocationQuantities === 'object' && inGrp.variantId
                  ? (allocationQuantities[inGrp.variantId] ?? 0)
                  : (typeof allocationQuantities === 'number' ? allocationQuantities : 0);
                return { ...r, allocatedQuantity: (r.allocatedQuantity ?? 0) + remaining, allocationWarehouseId: allocationWarehouseId };
              });
              onReplaceRecords('SALES_ORDER', allocationModal.docNumber, newRecords);
              onCommittedWarehouse?.(allocationWarehouseId);
              onClose();
            }}
            disabled={!allocationWarehouseId}
            className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AllocationModal);
