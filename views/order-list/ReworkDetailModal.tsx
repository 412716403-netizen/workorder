
import React from 'react';
import { ProductionOrder, Product, GlobalNodeTemplate, ProductionOpRecord, AppDictionaries } from '../../types';

function fmtDT(ts: string | Date | undefined | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

interface ReworkDetailModalProps {
  orderId: string;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  prodRecords: ProductionOpRecord[];
  reworkStatsByOrderId: Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>;
}

const ReworkDetailModal: React.FC<ReworkDetailModalProps> = ({
  orderId,
  onClose,
  orders,
  products,
  globalNodes,
  dictionaries,
  prodRecords,
  reworkStatsByOrderId,
}) => {
  const productMap = new Map<string, Product>(products.map(p => [p.id, p]));
  const mainOrder = orders.find(o => o.id === orderId);
  if (!mainOrder) return null;
  const childOrders = orders.filter(o => o.parentOrderId === orderId);
  const orderIds = [orderId, ...childOrders.map(o => o.id)];
  const product = productMap.get(mainOrder.productId);
  const orderTotalQty = mainOrder.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  const defectByNode = new Map<string, { name: string; defective: number; rework: number; scrap: number; pending: number }>();
  orderIds.forEach(oid => {
    const order = orders.find(o => o.id === oid);
    if (!order) return;
    order.milestones?.forEach(ms => {
      const defective = (ms.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
      const rework = (prodRecords || []).filter(r => r.type === 'REWORK' && r.orderId === oid && (r.sourceNodeId ?? r.nodeId) === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
      const scrap = (prodRecords || []).filter(r => r.type === 'SCRAP' && r.orderId === oid && r.nodeId === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
      const pending = Math.max(0, defective - rework - scrap);
      if (defective <= 0 && rework <= 0 && scrap <= 0) return;
      const name = globalNodes.find(n => n.id === ms.templateId)?.name ?? ms.templateId;
      const cur = defectByNode.get(ms.templateId) ?? { name, defective: 0, rework: 0, scrap: 0, pending: 0 };
      cur.defective += defective;
      cur.rework += rework;
      cur.scrap += scrap;
      cur.pending += pending;
      defectByNode.set(ms.templateId, cur);
    });
  });
  const defectRows = Array.from(defectByNode.entries()).map(([nodeId, v]) => ({ nodeId, ...v })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const reworkStatsByNode = new Map<string, { name: string; totalQty: number; completedQty: number; pendingQty: number }>();
  orderIds.forEach(oid => {
    const stats = reworkStatsByOrderId.get(oid) ?? [];
    stats.forEach(s => {
      const cur = reworkStatsByNode.get(s.nodeId) ?? { name: s.nodeName, totalQty: 0, completedQty: 0, pendingQty: 0 };
      cur.totalQty += s.totalQty;
      cur.completedQty += s.completedQty;
      cur.pendingQty += s.pendingQty;
      reworkStatsByNode.set(s.nodeId, cur);
    });
  });
  const reworkStatRows = Array.from(reworkStatsByNode.entries()).map(([nodeId, v]) => ({ nodeId, ...v })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const defectRecordsList = (prodRecords || []).filter((r): r is ProductionOpRecord => (r.type === 'REWORK' || r.type === 'SCRAP') && orderIds.includes(r.orderId ?? '')).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  const reworkReportList = (prodRecords || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK_REPORT' && orderIds.includes(r.orderId ?? '')).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

  const getSourceNodeName = (rec: ProductionOpRecord) => {
    const sid = rec.type === 'REWORK' ? (rec.sourceNodeId ?? rec.nodeId) : rec.nodeId;
    return sid ? (globalNodes.find(n => n.id === sid)?.name ?? sid) : '—';
  };
  const getReworkTargetNodes = (rec: ProductionOpRecord) => (rec.reworkNodeIds?.length ? rec.reworkNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、') : (rec.nodeId ? (globalNodes.find(n => n.id === rec.nodeId)?.name ?? rec.nodeId) : '—'));

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{mainOrder.orderNumber}</span>
            返工详情
          </h3>
          <p className="text-xs text-slate-500 mt-1">本页仅展示该工单的返工与不良处理情况</p>
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <span className="font-bold text-slate-800">{mainOrder.productName ?? product?.name ?? '—'}</span>
            <span className="text-slate-500">总数量 {orderTotalQty} 件</span>
            {mainOrder.customer && <span className="text-slate-500">客户 {mainOrder.customer}</span>}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {defectRows.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">不良与处理汇总（按来源工序）</h4>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">报工不良</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已生成返工</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已报损</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">待处理</th></tr></thead>
                  <tbody>
                    {defectRows.map(row => (
                      <tr key={row.nodeId} className="border-b border-slate-100"><td className="px-4 py-3 font-bold text-slate-800">{row.name}</td><td className="px-4 py-3 text-right text-slate-600">{row.defective}</td><td className="px-4 py-3 text-right text-slate-600">{row.rework}</td><td className="px-4 py-3 text-right text-slate-600">{row.scrap}</td><td className="px-4 py-3 text-right font-bold text-amber-600">{row.pending}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {reworkStatRows.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">工序返工未报工</h4>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">返工总量</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已报工</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">未报工</th></tr></thead>
                  <tbody>
                    {reworkStatRows.map(row => (
                      <tr key={row.nodeId} className="border-b border-slate-100"><td className="px-4 py-3 font-bold text-slate-800">{row.name}</td><td className="px-4 py-3 text-right text-slate-600">{row.totalQty}</td><td className="px-4 py-3 text-right text-emerald-600">{row.completedQty}</td><td className="px-4 py-3 text-right font-bold text-amber-600">{row.pendingQty}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div>
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">处理不良品记录（生成返工 + 报损）</h4>
            {defectRecordsList.length === 0 ? <p className="text-slate-400 text-sm py-4">暂无记录</p> : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">类型</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">来源工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">数量</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">返工目标工序</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">时间</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">操作人</th></tr></thead>
                  <tbody>
                    {defectRecordsList.map(r => (
                      <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3"><span className={r.type === 'REWORK' ? 'text-indigo-600 font-bold' : 'text-rose-600 font-bold'}>{r.type === 'REWORK' ? '返工' : '报损'}</span></td><td className="px-4 py-3 text-slate-700">{getSourceNodeName(r)}</td><td className="px-4 py-3 text-right font-bold text-slate-800">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.type === 'REWORK' ? getReworkTargetNodes(r) : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{fmtDT(r.timestamp)}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">返工报工记录</h4>
            {reworkReportList.length === 0 ? <p className="text-slate-400 text-sm py-4">暂无记录</p> : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">报工数量</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">时间</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">操作人</th></tr></thead>
                  <tbody>
                    {reworkReportList.map(r => (
                      <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3 text-slate-700">{globalNodes.find(n => n.id === r.nodeId)?.name ?? r.nodeId ?? '—'}</td><td className="px-4 py-3 text-right font-bold text-indigo-600">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.variantId ? (product?.variants?.find(v => v.id === r.variantId) as { skuSuffix?: string } | undefined)?.skuSuffix ?? r.variantId : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{fmtDT(r.timestamp)}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">关闭</button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReworkDetailModal);
