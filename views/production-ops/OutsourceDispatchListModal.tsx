import React, { useState, useMemo } from 'react';
import { ClipboardList, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '../../types';

export interface DispatchRow {
  orderId?: string;
  orderNumber?: string;
  productId: string;
  productName: string;
  nodeId: string;
  milestoneName: string;
  orderTotalQty: number;
  reportedQty: number;
  dispatchedQty: number;
  availableQty: number;
}

export interface OutsourceDispatchListModalProps {
  productionLinkMode: 'order' | 'product';
  outsourceDispatchRows: DispatchRow[];
  products: Product[];
  dispatchSelectedKeys: Set<string>;
  setDispatchSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  onDispatchFormOpen: () => void;
  onClose: () => void;
}

const OutsourceDispatchListModal: React.FC<OutsourceDispatchListModalProps> = ({
  productionLinkMode,
  outsourceDispatchRows,
  products,
  dispatchSelectedKeys,
  setDispatchSelectedKeys,
  onDispatchFormOpen,
  onClose,
}) => {
  const [searchOrder, setSearchOrder] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [searchNodeId, setSearchNodeId] = useState('');

  const nodeOptions = useMemo(() => {
    const seen = new Set<string>();
    const init: { value: string; label: string }[] = [];
    return outsourceDispatchRows.reduce((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, init);
  }, [outsourceDispatchRows]);

  const filteredRows = useMemo(() => {
    const orderKw = (searchOrder || '').trim().toLowerCase();
    const productKw = (searchProduct || '').trim().toLowerCase();
    return outsourceDispatchRows.filter(row => {
      if (productionLinkMode === 'order' && orderKw && !(row.orderNumber || '').toLowerCase().includes(orderKw)) return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (searchNodeId && row.nodeId !== searchNodeId) return false;
      return true;
    });
  }, [outsourceDispatchRows, searchOrder, searchProduct, searchNodeId, products, productionLinkMode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600" /> 待发清单</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <p className="text-xs text-slate-500">
            {productionLinkMode === 'product'
              ? '仅显示工序节点中已开启「可外协」的工序；可委外数量 = 产品该工序报工完成量 − 已委外发出。同一批次只能选择同一工序同时发出。'
              : '仅显示工序节点中已开启「可外协」的工序；可委外数量 = 工单总量 − 该工序已报工 − 已委外发出。同一批次只能选择同一工序的工单同时发出。'}
          </p>
        </div>
        <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex flex-wrap items-center gap-3">
          {productionLinkMode !== 'product' && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</label>
              <input type="text" value={searchOrder} onChange={e => setSearchOrder(e.target.value)} placeholder="工单号模糊搜索" className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">货号</label>
            <input type="text" value={searchProduct} onChange={e => setSearchProduct(e.target.value)} placeholder="产品名/SKU 模糊搜索" className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</label>
            <select value={searchNodeId} onChange={e => setSearchNodeId(e.target.value)} className="rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
              <option value="">全部</option>
              {nodeOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
            </select>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                <th className="w-12 px-4 py-3" />
                {productionLinkMode !== 'product' && <th className="w-[28%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工单号</th>}
                <th className={`${productionLinkMode === 'product' ? 'w-[40%]' : 'w-[28%]'} px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest`}>产品</th>
                <th className="w-[20%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工序</th>
                <th className="w-[24%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">可委外数量</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={productionLinkMode === 'product' ? 4 : 5} className="px-6 py-16 text-center text-slate-400 text-sm">{outsourceDispatchRows.length === 0 ? (productionLinkMode === 'product' ? '暂无可外协工序或可委外数量均为 0。请先在关联产品报工中完成该工序报工。' : '暂无可外协工序，或可委外数量均为 0。请在系统设置中为工序开启「可外协」并确保工单有未委外数量。') : '无匹配项，请调整搜索条件。'}</td>
                </tr>
              ) : (
                filteredRows.map(row => {
                  const key = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`;
                  const checked = dispatchSelectedKeys.has(key);
                  return (
                    <tr key={key} className="hover:bg-slate-50/50 bg-white">
                      <td className="w-12 px-4 py-3 align-middle">
                        <input type="checkbox" checked={checked} onChange={() => {
                          setDispatchSelectedKeys(prev => {
                            const next = new Set(prev);
                            if (next.has(key)) { next.delete(key); return next; }
                            if (next.size > 0) {
                              const selectedNodeId = next.values().next().value?.split('|')[1];
                              if (selectedNodeId !== row.nodeId) { toast.warning('只能选择同一工序同时发出，请先取消其他工序的勾选。'); return prev; }
                            }
                            next.add(key);
                            return next;
                          });
                        }} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      </td>
                      {productionLinkMode !== 'product' && <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.orderNumber}>{row.orderNumber}</td>}
                      <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.productName}>{row.productName}</td>
                      <td className="px-6 py-3 text-sm font-bold text-indigo-600 align-middle truncate" title={row.milestoneName}>{row.milestoneName}</td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-slate-700 align-middle">{row.availableQty}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {outsourceDispatchRows.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
            <span className="text-sm font-bold text-slate-600">已选 {dispatchSelectedKeys.size} 项</span>
            <button type="button" disabled={dispatchSelectedKeys.size === 0} onClick={onDispatchFormOpen} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <Check className="w-4 h-4" /> 外协发出
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OutsourceDispatchListModal);
