import React, { useState, useMemo } from 'react';
import { ArrowDownToLine, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, Partner } from '../../types';

export interface ReceiveRow {
  orderId?: string;
  nodeId: string;
  productId: string;
  orderNumber?: string;
  productName: string;
  milestoneName: string;
  partner: string;
  dispatched: number;
  received: number;
  pending: number;
}

export interface OutsourceReceiveListModalProps {
  productionLinkMode: 'order' | 'product';
  outsourceReceiveRows: ReceiveRow[];
  products: Product[];
  partners: Partner[];
  receiveSelectedKeys: Set<string>;
  setReceiveSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  onReceiveFormOpen: () => void;
  onClose: () => void;
}

const OutsourceReceiveListModal: React.FC<OutsourceReceiveListModalProps> = ({
  productionLinkMode,
  outsourceReceiveRows,
  products,
  partners,
  receiveSelectedKeys,
  setReceiveSelectedKeys,
  onReceiveFormOpen,
  onClose,
}) => {
  const [searchOrder, setSearchOrder] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [searchPartner, setSearchPartner] = useState('');
  const [searchNodeId, setSearchNodeId] = useState('');

  const nodeOptions = useMemo(() => {
    const seen = new Set<string>();
    const init: { value: string; label: string }[] = [];
    return outsourceReceiveRows.reduce((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, init);
  }, [outsourceReceiveRows]);

  const filteredRows = useMemo(() => {
    const orderKw = (searchOrder || '').trim().toLowerCase();
    const productKw = (searchProduct || '').trim().toLowerCase();
    const partnerKw = (searchPartner || '').trim().toLowerCase();
    return outsourceReceiveRows.filter(row => {
      if (productionLinkMode === 'order' && orderKw && !(row.orderNumber || '').toLowerCase().includes(orderKw)) return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (partnerKw && !(row.partner || '').toLowerCase().includes(partnerKw)) return false;
      if (searchNodeId && row.nodeId !== searchNodeId) return false;
      return true;
    });
  }, [outsourceReceiveRows, searchOrder, searchProduct, searchPartner, searchNodeId, products, productionLinkMode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 待收回清单</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <p className="text-xs text-slate-500">{productionLinkMode === 'product' ? '已发出未收回的产品+工序+外协厂汇总；勾选后点击「批量收回」填写本次收回数量。' : '已发出未收回的工单+工序汇总；点击「收回」填写本次收回数量。'}</p>
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
            <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</label>
            <input type="text" value={searchPartner} onChange={e => setSearchPartner(e.target.value)} placeholder="模糊搜索" className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                {productionLinkMode !== 'product' && <th className="w-[18%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工单号</th>}
                <th className="w-[18%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">产品</th>
                <th className="w-[14%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工序</th>
                <th className="w-[14%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">外协厂商</th>
                <th className="w-[9%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">发出总量</th>
                <th className="w-[9%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已收总量</th>
                <th className="w-[9%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待收数量</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={productionLinkMode === 'product' ? 7 : 8} className="px-6 py-16 text-center text-slate-400 text-sm">{outsourceReceiveRows.length === 0 ? '暂无待收回项。' : '无匹配项，请调整搜索条件。'}</td></tr>
              ) : (
                filteredRows.map(row => {
                  const key = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`;
                  const checked = receiveSelectedKeys.has(key);
                  return (
                    <tr key={key} className="hover:bg-slate-50/50 bg-white">
                      <td className="w-12 px-4 py-3 align-middle">
                        <input type="checkbox" checked={checked} onChange={() => {
                          setReceiveSelectedKeys(prev => {
                            const next = new Set(prev);
                            if (next.has(key)) { next.delete(key); return next; }
                            if (next.size > 0) {
                              const firstKey = next.values().next().value;
                              const firstRow = outsourceReceiveRows.find(r => (r.orderId != null ? `${r.orderId}|${r.nodeId}` : `${r.productId}|${r.nodeId}|${r.partner}`) === firstKey);
                              const selectedPartner = firstRow?.partner ?? '';
                              if (selectedPartner !== (row.partner ?? '')) { toast.warning('只能选择同一外协工厂同时收货，请先取消其他加工厂的勾选。'); return prev; }
                              const selectedNodeId = firstKey?.split('|')[1];
                              if (selectedNodeId !== row.nodeId) { toast.warning('只能选择同一工序同时收货，请先取消其他工序的勾选。'); return prev; }
                            }
                            next.add(key);
                            return next;
                          });
                        }} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      </td>
                      {productionLinkMode !== 'product' && <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.orderNumber}>{row.orderNumber}</td>}
                      <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.productName}>{row.productName}</td>
                      <td className="px-6 py-3 text-sm font-bold text-indigo-600 align-middle truncate" title={row.milestoneName}>{row.milestoneName}</td>
                      <td className="px-6 py-3 text-sm font-bold text-slate-700 align-middle truncate" title={row.partner || '—'}>
                        {row.partner || '—'}
                        {partners.find(p => p.name === row.partner)?.collaborationTenantId && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-50 text-indigo-600 uppercase">协作</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-slate-700 align-middle">{row.dispatched}</td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-emerald-600 align-middle">{row.received}</td>
                      <td className="px-6 py-3 text-right text-sm font-black text-amber-600 align-middle">{row.pending}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {outsourceReceiveRows.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
            <span className="text-sm font-bold text-slate-600">已选 {receiveSelectedKeys.size} 项</span>
            <button type="button" disabled={receiveSelectedKeys.size === 0} onClick={onReceiveFormOpen} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <Check className="w-4 h-4" /> 收货
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OutsourceReceiveListModal);
