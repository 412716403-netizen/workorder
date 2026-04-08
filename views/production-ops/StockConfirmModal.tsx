import React from 'react';
import { Check, X } from 'lucide-react';
import type { ProductionOrder, Product, Warehouse, AppDictionaries } from '../../types';

export interface StockConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  stockSelectMode: 'stock_out' | 'stock_return' | null;
  stockSelectOrderId: string | null;
  stockSelectSourceProductId: string | null;
  stockSelectedIds: Set<string>;
  stockConfirmQuantities: Record<string, number>;
  onQuantityChange: (productId: string, quantity: number) => void;
  stockConfirmWarehouseId: string;
  onWarehouseChange: (warehouseId: string) => void;
  stockConfirmReason: string;
  onReasonChange: (reason: string) => void;
  orders: ProductionOrder[];
  products: Product[];
  warehouses: Warehouse[];
  dictionaries?: AppDictionaries;
  partnerLabel?: string;
}

const StockConfirmModal: React.FC<StockConfirmModalProps> = ({
  visible,
  onClose,
  onSubmit,
  stockSelectMode,
  stockSelectOrderId,
  stockSelectSourceProductId,
  stockSelectedIds,
  stockConfirmQuantities,
  onQuantityChange,
  stockConfirmWarehouseId,
  onWarehouseChange,
  stockConfirmReason,
  onReasonChange,
  orders,
  products,
  warehouses,
  dictionaries,
  partnerLabel,
}) => {
  if (!visible || (!stockSelectOrderId && !stockSelectSourceProductId) || !stockSelectMode) return null;

  const order = stockSelectOrderId ? orders.find(o => o.id === stockSelectOrderId) : undefined;
  const srcProd = stockSelectSourceProductId ? products.find(p => p.id === stockSelectSourceProductId) : undefined;
  const selectedList: string[] = Array.from(stockSelectedIds);
  const hasValidQty = selectedList.some(pid => (stockConfirmQuantities[pid] ?? 0) > 0);
  const isReturn = stockSelectMode === 'stock_return';
  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    return (p?.unitId && (dictionaries?.units ?? []).find(u => u.id === p.unitId)?.name) || '件';
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 flex-wrap">
            {partnerLabel && (
              <span className="bg-amber-50 text-amber-800 px-3 py-1.5 rounded-lg text-base font-black tracking-tight border border-amber-200/80 max-w-[min(100%,14rem)] truncate" title={partnerLabel}>{partnerLabel}</span>
            )}
            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
              {srcProd ? srcProd.name : (order?.orderNumber ?? '')}
            </span>
            {isReturn ? '确认退料' : '确认领料'}
          </h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!hasValidQty}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 ${isReturn ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              <Check className="w-4 h-4" /> {isReturn ? '确认退料' : '确认领料'}
            </button>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">{srcProd?.name ?? (order ? (products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—') : '—')}</h2>
          <div className={`grid gap-3 ${warehouses.length > 0 ? 'grid-cols-[1fr_1.5fr]' : 'grid-cols-1'}`}>
            {warehouses.length > 0 && (
              <div className="bg-slate-50 rounded-xl px-4 py-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{isReturn ? '退回仓库' : '出库仓库'}</p>
                <select
                  value={stockConfirmWarehouseId}
                  onChange={e => onWarehouseChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="bg-slate-50 rounded-xl px-4 py-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">备注</p>
              <input
                type="text"
                value={stockConfirmReason}
                onChange={e => onReasonChange(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="选填"
              />
            </div>
          </div>
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                </tr>
              </thead>
              <tbody>
                {selectedList.map(pid => {
                  const prod = products.find(p => p.id === pid);
                  return (
                    <tr key={pid} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? pid}</td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={stockConfirmQuantities[pid] ?? ''}
                          onChange={e => onQuantityChange(pid, Number(e.target.value) || 0)}
                          className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-500">{getUnitName(pid)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(StockConfirmModal);
