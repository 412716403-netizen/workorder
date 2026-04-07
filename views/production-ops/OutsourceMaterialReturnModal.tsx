import React from 'react';
import { Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProdOpType,
  BOM,
  GlobalNodeTemplate,
  Warehouse,
} from '../../types';

export interface OutsourceMaterialReturnModalProps {
  productionLinkMode: 'order' | 'product';
  matReturnOrderId: string | null;
  matReturnProductId: string | null;
  matReturnPartnerOptions: string[];
  matReturnPartner: string;
  setMatReturnPartner: React.Dispatch<React.SetStateAction<string>>;
  matReturnWarehouseId: string;
  setMatReturnWarehouseId: React.Dispatch<React.SetStateAction<string>>;
  matReturnRemark: string;
  setMatReturnRemark: React.Dispatch<React.SetStateAction<string>>;
  matReturnQty: Record<string, number>;
  setMatReturnQty: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  records: ProductionOpRecord[];
  warehouses: Warehouse[];
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
}

const OutsourceMaterialReturnModal: React.FC<OutsourceMaterialReturnModalProps> = ({
  productionLinkMode,
  matReturnOrderId,
  matReturnProductId,
  matReturnPartnerOptions,
  matReturnPartner,
  setMatReturnPartner,
  matReturnWarehouseId,
  setMatReturnWarehouseId,
  matReturnRemark,
  setMatReturnRemark,
  matReturnQty,
  setMatReturnQty,
  orders,
  products,
  boms,
  records,
  warehouses,
  onAddRecord,
  onAddRecordBatch,
  onClose,
}) => {
  const isProductMode = productionLinkMode === 'product';
  const targetOrder = !isProductMode && matReturnOrderId ? orders.find(o => o.id === matReturnOrderId) : undefined;
  const targetProductId = isProductMode ? matReturnProductId : targetOrder?.productId;
  const targetProduct = targetProductId ? products.find(p => p.id === targetProductId) : undefined;
  const dispatchedByPartnerMat = new Map<string, number>();
  const returnedByPartnerMat = new Map<string, number>();
  const matInfoMap = new Map<string, { name: string; sku: string }>();
  const filterForCard = (r: ProductionOpRecord) => {
    if (isProductMode) {
      return r.sourceProductId === targetProductId || (!r.orderId && !r.sourceProductId && r.productId);
    }
    return r.orderId === matReturnOrderId;
  };
  records.filter(r => r.type === 'STOCK_OUT' && !!r.partner && r.partner === matReturnPartner && filterForCard(r)).forEach(r => {
    const key = r.productId;
    dispatchedByPartnerMat.set(key, (dispatchedByPartnerMat.get(key) ?? 0) + r.quantity);
    if (!matInfoMap.has(key)) {
      const mp = products.find(px => px.id === key);
      matInfoMap.set(key, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '' });
    }
  });
  if (isProductMode) {
    const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
    records.filter(r => r.type === 'STOCK_OUT' && !!r.partner && r.partner === matReturnPartner && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
      const key = r.productId;
      dispatchedByPartnerMat.set(key, (dispatchedByPartnerMat.get(key) ?? 0) + r.quantity);
      if (!matInfoMap.has(key)) {
        const mp = products.find(px => px.id === key);
        matInfoMap.set(key, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '' });
      }
    });
  }
  records.filter(r => r.type === 'STOCK_RETURN' && !!r.partner && r.partner === matReturnPartner && filterForCard(r)).forEach(r => {
    returnedByPartnerMat.set(r.productId, (returnedByPartnerMat.get(r.productId) ?? 0) + r.quantity);
  });
  if (isProductMode) {
    const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
    records.filter(r => r.type === 'STOCK_RETURN' && !!r.partner && r.partner === matReturnPartner && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
      returnedByPartnerMat.set(r.productId, (returnedByPartnerMat.get(r.productId) ?? 0) + r.quantity);
    });
  }
  const consumedByPartnerMat = new Map<string, number>();
  (() => {
    const receivedByNode = new Map<string, number>();
    const outsourceFilter = (r: ProductionOpRecord) => {
      if (isProductMode) {
        return !r.orderId && r.productId === targetProductId;
      }
      return r.orderId === matReturnOrderId;
    };
    records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.partner === matReturnPartner && r.nodeId && outsourceFilter(r)).forEach(r => {
      receivedByNode.set(r.nodeId!, (receivedByNode.get(r.nodeId!) ?? 0) + r.quantity);
    });
    if (isProductMode) {
      const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
      records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.partner === matReturnPartner && r.nodeId && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
        receivedByNode.set(r.nodeId!, (receivedByNode.get(r.nodeId!) ?? 0) + r.quantity);
      });
    }
    receivedByNode.forEach((recvQty, nodeId) => {
      const nodeBoms = boms.filter(b => b.parentProductId === targetProductId && b.nodeId === nodeId);
      nodeBoms.forEach(bom => {
        bom.items.forEach(bi => {
          const matConsumption = Number(bi.quantity) * recvQty;
          consumedByPartnerMat.set(bi.productId, (consumedByPartnerMat.get(bi.productId) ?? 0) + matConsumption);
        });
      });
    });
  })();
  const returnableMaterials = Array.from(dispatchedByPartnerMat.entries()).map(([pid, dispatched]) => ({
    productId: pid,
    name: matInfoMap.get(pid)?.name ?? '未知物料',
    sku: matInfoMap.get(pid)?.sku ?? '',
    dispatched,
    consumed: consumedByPartnerMat.get(pid) ?? 0,
    returned: returnedByPartnerMat.get(pid) ?? 0,
  })).filter(m => m.dispatched > 0);
  const getNextWtDocNo = () => {
    const prefix = 'WT';
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `${prefix}${todayStr}-`;
    const existing = records.filter(r => r.type === 'STOCK_RETURN' && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${pattern}${String(maxSeq + 1).padStart(4, '0')}`;
  };
  const handleMatReturnSubmit = async () => {
    if (!matReturnPartner) { toast.warning('请选择外协工厂'); return; }
    const toReturn = returnableMaterials.filter(m => (matReturnQty[m.productId] ?? 0) > 0);
    if (toReturn.length === 0) { toast.warning('请至少填写一项退回数量'); return; }
    const overItems = toReturn.filter(m => (matReturnQty[m.productId] ?? 0) > Math.max(0, m.dispatched - m.consumed - m.returned));
    if (overItems.length > 0) { toast.warning(`「${overItems[0].name}」退回数量超过可退回数量`); return; }
    const docNo = getNextWtDocNo();
    const timestamp = new Date().toLocaleString();
    const batch: ProductionOpRecord[] = toReturn.map(m => ({
      id: `wt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'STOCK_RETURN' as ProdOpType,
      orderId: isProductMode ? undefined : (matReturnOrderId ?? undefined),
      productId: m.productId,
      quantity: matReturnQty[m.productId],
      operator: '张主管',
      timestamp,
      status: '已完成',
      partner: matReturnPartner,
      warehouseId: matReturnWarehouseId || undefined,
      docNo,
      reason: matReturnRemark.trim() || undefined,
      sourceProductId: isProductMode ? (targetProductId ?? undefined) : undefined,
    }));
    if (onAddRecordBatch && batch.length > 1) { await onAddRecordBatch(batch); } else { for (const rec of batch) onAddRecord(rec); }
    toast.success(`已退回 ${toReturn.length} 种物料，来自「${matReturnPartner}」`);
    onClose();
  };
  const headerLabel = isProductMode ? (targetProduct?.name ?? '—') : `${targetOrder?.orderNumber ?? '—'} — ${targetProduct?.name ?? '—'}`;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Undo2 className="w-5 h-5 text-amber-600" /> 物料退回</h3>
            <p className="text-sm text-slate-500 mt-0.5">{headerLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">外协工厂</label>
              {matReturnPartnerOptions.length <= 1 ? (
                <div className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-slate-50">{matReturnPartnerOptions[0] ?? '—'}</div>
              ) : (
                <select value={matReturnPartner} onChange={e => { setMatReturnPartner(e.target.value); setMatReturnQty({}); }} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none bg-white">
                  {matReturnPartnerOptions.map(p => (<option key={p} value={p}>{p}</option>))}
                </select>
              )}
            </div>
            {warehouses.length > 0 && (
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">退回仓库</label>
                <select value={matReturnWarehouseId} onChange={e => setMatReturnWarehouseId(e.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none bg-white">
                  {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>))}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">备注说明</label>
            <input type="text" value={matReturnRemark} onChange={e => setMatReturnRemark(e.target.value)} placeholder="选填" className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-amber-500 outline-none placeholder:text-slate-400" />
          </div>
          {returnableMaterials.length === 0 ? (
            <p className="py-8 text-center text-slate-400 text-sm">该工厂暂无外发记录</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已外发</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">交货耗材</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已退回</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">可退回</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次退回数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {returnableMaterials.map(m => {
                  const remaining = Math.max(0, m.dispatched - m.consumed - m.returned);
                  return (
                    <tr key={m.productId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3"><p className="text-sm font-bold text-slate-800">{m.name}</p>{m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-indigo-600">{m.dispatched}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-rose-600">{m.consumed}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-amber-600">{m.returned}</td>
                      <td className="px-4 py-3 text-right text-sm font-black text-emerald-600">{remaining}</td>
                      <td className="px-4 py-3">
                        <input type="number" min={0} max={remaining} step={1} value={matReturnQty[m.productId] ?? ''} onChange={e => setMatReturnQty(prev => ({ ...prev, [m.productId]: Math.min(Number(e.target.value) || 0, remaining) }))} className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-amber-500 outline-none" placeholder="0" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {returnableMaterials.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
            <button type="button" onClick={handleMatReturnSubmit} disabled={!returnableMaterials.some(m => (matReturnQty[m.productId] ?? 0) > 0) || !matReturnPartner} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"><Undo2 className="w-4 h-4" /> 确认退回</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OutsourceMaterialReturnModal);
