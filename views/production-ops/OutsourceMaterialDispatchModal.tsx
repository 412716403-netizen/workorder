import React from 'react';
import { Package, X, ArrowUpFromLine } from 'lucide-react';
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

export interface OutsourceMaterialDispatchModalProps {
  productionLinkMode: 'order' | 'product';
  matDispatchOrderId: string | null;
  matDispatchProductId: string | null;
  matDispatchPartnerOptions: string[];
  matDispatchPartner: string;
  setMatDispatchPartner: React.Dispatch<React.SetStateAction<string>>;
  matDispatchWarehouseId: string;
  setMatDispatchWarehouseId: React.Dispatch<React.SetStateAction<string>>;
  matDispatchRemark: string;
  setMatDispatchRemark: React.Dispatch<React.SetStateAction<string>>;
  matDispatchQty: Record<string, number>;
  setMatDispatchQty: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  records: ProductionOpRecord[];
  warehouses: Warehouse[];
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
}

const OutsourceMaterialDispatchModal: React.FC<OutsourceMaterialDispatchModalProps> = ({
  productionLinkMode,
  matDispatchOrderId,
  matDispatchProductId,
  matDispatchPartnerOptions,
  matDispatchPartner,
  setMatDispatchPartner,
  matDispatchWarehouseId,
  setMatDispatchWarehouseId,
  matDispatchRemark,
  setMatDispatchRemark,
  matDispatchQty,
  setMatDispatchQty,
  orders,
  products,
  boms,
  globalNodes,
  records,
  warehouses,
  onAddRecord,
  onAddRecordBatch,
  onClose,
}) => {
  const isProductMode = productionLinkMode === 'product';
  const targetOrder = !isProductMode && matDispatchOrderId ? orders.find(o => o.id === matDispatchOrderId) : undefined;
  const targetProductId = isProductMode ? matDispatchProductId : targetOrder?.productId;
  const targetProduct = targetProductId ? products.find(p => p.id === targetProductId) : undefined;
  const orderQty = targetOrder?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const bomMaterials: { productId: string; name: string; sku: string; unitNeeded: number; nodeNames: string[] }[] = [];
  const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
  const addBomItems = (bom: BOM, qty: number, nodeName: string) => {
    bom.items.forEach(bi => {
      const mp = products.find(px => px.id === bi.productId);
      const add = Number(bi.quantity) * qty;
      const existing = matMap.get(bi.productId);
      if (existing) {
        existing.unitNeeded += add;
        if (nodeName) existing.nodeNames.add(nodeName);
      } else {
        const ns = new Set<string>();
        if (nodeName) ns.add(nodeName);
        matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns });
      }
    });
  };
  if (isProductMode && targetProduct) {
    const relatedOrders = orders.filter(o => o.productId === targetProduct.id);
    const variants = targetProduct.variants ?? [];
    relatedOrders.forEach(ord => {
      const oQty = ord.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
      if (variants.length > 0) {
        ord.items?.forEach(item => {
          const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
          const lineQty = item.quantity;
          const seenBomIds = new Set<string>();
          if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
            (Object.entries(v.nodeBoms) as [string, string][]).forEach(([nodeId, bomId]) => {
              if (seenBomIds.has(bomId)) return;
              seenBomIds.add(bomId);
              const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
              const bom = boms.find(b => b.id === bomId);
              if (bom) addBomItems(bom, lineQty, nodeName);
            });
          } else {
            boms.filter(b => b.parentProductId === targetProduct.id && b.variantId === v.id && b.nodeId).forEach(bom => {
              if (seenBomIds.has(bom.id)) return;
              seenBomIds.add(bom.id);
              const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
              addBomItems(bom, lineQty, nodeName);
            });
          }
        });
      }
      if (matMap.size === 0) {
        const seenBomIds = new Set<string>();
        boms.filter(b => b.parentProductId === targetProduct.id && b.nodeId).forEach(bom => {
          if (seenBomIds.has(bom.id)) return;
          seenBomIds.add(bom.id);
          const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
          const qty = bom.variantId
            ? (ord.items?.find(i => i.variantId === bom.variantId)?.quantity ?? 0)
            : oQty;
          addBomItems(bom, qty, nodeName);
        });
      }
    });
  } else if (targetOrder && targetProduct) {
    const variants = targetProduct.variants ?? [];
    if (variants.length > 0) {
      targetOrder.items?.forEach(item => {
        const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
        const lineQty = item.quantity;
        const seenBomIds = new Set<string>();
        if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
          (Object.entries(v.nodeBoms) as [string, string][]).forEach(([nodeId, bomId]) => {
            if (seenBomIds.has(bomId)) return;
            seenBomIds.add(bomId);
            const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
            const bom = boms.find(b => b.id === bomId);
            if (bom) addBomItems(bom, lineQty, nodeName);
          });
        } else {
          boms.filter(b => b.parentProductId === targetProduct.id && b.variantId === v.id && b.nodeId).forEach(bom => {
            if (seenBomIds.has(bom.id)) return;
            seenBomIds.add(bom.id);
            const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
            addBomItems(bom, lineQty, nodeName);
          });
        }
      });
    }
    if (matMap.size === 0) {
      const seenBomIds = new Set<string>();
      boms.filter(b => b.parentProductId === targetProduct.id && b.nodeId).forEach(bom => {
        if (seenBomIds.has(bom.id)) return;
        seenBomIds.add(bom.id);
        const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
        const qty = bom.variantId
          ? (targetOrder.items?.find(i => i.variantId === bom.variantId)?.quantity ?? 0)
          : orderQty;
        addBomItems(bom, qty, nodeName);
      });
    }
  }
  matMap.forEach((v, pid) => {
    bomMaterials.push({ productId: pid, ...v, nodeNames: Array.from(v.nodeNames) });
  });
  const issuedMap = new Map<string, number>();
  if (isProductMode) {
    records.filter(r => r.type === 'STOCK_OUT' && r.productId && (r.sourceProductId === targetProductId || (!r.orderId && !r.sourceProductId && r.productId))).forEach(r => {
      issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
    });
    const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
    records.filter(r => r.type === 'STOCK_OUT' && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
      issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
    });
  } else if (targetOrder) {
    records.filter(r => r.type === 'STOCK_OUT' && r.orderId === targetOrder.id && r.reason !== '来自于返工').forEach(r => {
      issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
    });
  }
  const getNextWfDocNo = () => {
    const prefix = 'WF';
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `${prefix}${todayStr}-`;
    const existing = records.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${pattern}${String(maxSeq + 1).padStart(4, '0')}`;
  };
  const handleMatDispatchSubmit = async () => {
    if (!matDispatchPartner) {
      toast.warning('请选择外协工厂');
      return;
    }
    const toIssue = bomMaterials.filter(m => (matDispatchQty[m.productId] ?? 0) > 0);
    if (toIssue.length === 0) {
      toast.warning('请至少填写一项发出数量');
      return;
    }
    const docNo = getNextWfDocNo();
    const timestamp = new Date().toLocaleString();
    const batch: ProductionOpRecord[] = toIssue.map(m => ({
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'STOCK_OUT' as ProdOpType,
      orderId: isProductMode ? undefined : (matDispatchOrderId ?? undefined),
      productId: m.productId,
      quantity: matDispatchQty[m.productId],
      operator: '张主管',
      timestamp,
      status: '已完成',
      partner: matDispatchPartner,
      warehouseId: matDispatchWarehouseId || undefined,
      docNo,
      reason: matDispatchRemark.trim() || undefined,
      sourceProductId: isProductMode ? (targetProductId ?? undefined) : undefined,
    }));
    if (onAddRecordBatch && batch.length > 1) {
      await onAddRecordBatch(batch);
    } else {
      for (const rec of batch) onAddRecord(rec);
    }
    toast.success(`已外发 ${toIssue.length} 种物料至「${matDispatchPartner}」`);
    onClose();
  };
  const headerLabel = isProductMode
    ? (targetProduct?.name ?? '—')
    : `${targetOrder?.orderNumber ?? '—'} — ${targetProduct?.name ?? '—'}`;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" /> 物料外发
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">{headerLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">外协工厂</label>
              {matDispatchPartnerOptions.length <= 1 ? (
                <div className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-slate-50">{matDispatchPartnerOptions[0] ?? '—'}</div>
              ) : (
                <select
                  value={matDispatchPartner}
                  onChange={e => setMatDispatchPartner(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {matDispatchPartnerOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </div>
            {warehouses.length > 0 && (
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                <select
                  value={matDispatchWarehouseId}
                  onChange={e => setMatDispatchWarehouseId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">备注说明</label>
            <input
              type="text"
              value={matDispatchRemark}
              onChange={e => setMatDispatchRemark(e.target.value)}
              placeholder="选填"
              className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
            />
          </div>
          {bomMaterials.length === 0 ? (
            <p className="py-8 text-center text-slate-400 text-sm">该{isProductMode ? '产品' : '工单'}未配置 BOM 物料，无法进行物料外发</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">理论需量</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">已发进度</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次外发数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bomMaterials.map(m => {
                  const issued = issuedMap.get(m.productId) ?? 0;
                  return (
                    <tr key={m.productId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-800">{m.name}</p>
                          {m.nodeNames.map(nn => (
                            <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{nn}</span>
                          ))}
                        </div>
                        {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{m.unitNeeded}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const needed = m.unitNeeded;
                          const pct = needed > 0 ? Math.min(100, (issued / needed) * 100) : 0;
                          const overIssue = issued > needed;
                          return (
                            <div className="flex flex-col gap-1">
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                {overIssue ? (
                                  <>
                                    <div className="h-full bg-emerald-500" style={{ width: `${(needed / issued) * 100}%` }} />
                                    <div className="h-full bg-rose-500" style={{ width: `${((issued - needed) / issued) * 100}%` }} />
                                  </>
                                ) : (
                                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                                )}
                              </div>
                              <span className="text-[9px] font-bold text-slate-500">
                                {overIssue ? <span>已发 {issued} <span className="text-rose-500">（超发 {issued - needed}）</span></span> : `已发 ${issued}`}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={matDispatchQty[m.productId] ?? ''}
                          onChange={e => setMatDispatchQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))}
                          className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {bomMaterials.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleMatDispatchSubmit}
              disabled={!bomMaterials.some(m => (matDispatchQty[m.productId] ?? 0) > 0) || !matDispatchPartner}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <ArrowUpFromLine className="w-4 h-4" /> 确认外发
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OutsourceMaterialDispatchModal);
