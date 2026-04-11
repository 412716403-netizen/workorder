import React from 'react';
import { X, PackageCheck } from 'lucide-react';
import { Product, Warehouse, AppDictionaries, ProductVariant } from '../../types';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
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
  onClose,
}) => {
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
          {allocationModal.grp.some((i: any) => i.variantId) ? (
            <div className="space-y-4 overflow-auto">
              {(() => {
                const groupedByColor: Record<string, ProductVariant[]> = {};
                const grpVariantIds = new Set(allocationModal.grp.map((i: any) => i.variantId).filter(Boolean));
                allocationModal.product?.variants?.forEach((v: ProductVariant) => {
                  if (!grpVariantIds.has(v.id)) return;
                  if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                  groupedByColor[v.colorId].push(v);
                });
                return sortedVariantColorEntries(groupedByColor, allocationModal.product?.colorIds, allocationModal.product?.sizeIds).map(([colorId, colorVariants]) => {
                  const color = dictionaries.colors.find(c => c.id === colorId);
                  return (
                    <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm">
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                        <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {colorVariants.map(v => {
                          const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                          const remainingQty = typeof allocationQuantities === 'object' ? (allocationQuantities[v.id] ?? 0) : 0;
                          return (
                            <div key={v.id} className="flex flex-col gap-0.5 w-20">
                              <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                              <input
                                type="number"
                                min={0}
                                placeholder="0"
                                value={remainingQty || ''}
                                onChange={e => {
                                  const val = parseInt(e.target.value, 10);
                                  if (typeof allocationQuantities !== 'object') return;
                                  onQuantityChange({ ...allocationQuantities, [v.id]: isNaN(val) ? 0 : val });
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                title="本次配货数量"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
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
