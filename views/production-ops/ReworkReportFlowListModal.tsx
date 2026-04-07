import React, { useState, useMemo } from 'react';
import { History, X, Filter, FileText } from 'lucide-react';
import { ProductionOpRecord, ProductionOrder, Product, GlobalNodeTemplate } from '../../types';
import { hasOpsPerm } from './types';

export interface ReworkReportFlowListModalProps {
  productionLinkMode: 'order' | 'product';
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  userPermissions?: string[];
  tenantRole?: string;
  onClose: () => void;
  onViewDetail: (record: ProductionOpRecord) => void;
}

const ReworkReportFlowListModal: React.FC<ReworkReportFlowListModalProps> = ({
  productionLinkMode,
  records,
  orders,
  products,
  globalNodes,
  userPermissions,
  tenantRole,
  onClose,
  onViewDetail,
}) => {
  const [reworkFlowFilter, setReworkFlowFilter] = useState<{ dateFrom: string; dateTo: string; orderNumber: string; productId: string; nodeName: string; operator: string; reportNo: string }>({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', reportNo: '' });

  const reworkRecords = useMemo(() => (records || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK_REPORT'), [records]);

  const validDocNoRe = /^FG\d{8}-\d{4}$/;
  const getDateStr = (r: ProductionOpRecord) => {
    const d = r.timestamp ? new Date(r.timestamp) : new Date();
    return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0].replace(/-/g, '') : d.toISOString().split('T')[0].replace(/-/g, '');
  };

  const reworkDisplayDocNoMap = useMemo(() => {
    const needFallback = reworkRecords.filter(r => !r.docNo || !validDocNoRe.test(r.docNo));
    const needFallbackSorted = [...needFallback].sort((a, b) => {
      const da = getDateStr(a), db = getDateStr(b);
      if (da !== db) return da.localeCompare(db);
      const ta = new Date(a.timestamp || 0).getTime(), tb = new Date(b.timestamp || 0).getTime();
      if (ta !== tb) return ta - tb;
      return (a.id || '').localeCompare(b.id || '');
    });
    const map = new Map<string, string>();
    const seqByDate: Record<string, number> = {};
    needFallbackSorted.forEach(r => {
      const ds = getDateStr(r);
      seqByDate[ds] = (seqByDate[ds] ?? 0) + 1;
      map.set(r.id, `FG${ds}-${String(seqByDate[ds]).padStart(4, '0')}`);
    });
    return map;
  }, [reworkRecords]);

  const getDisplayDocNo = (r: ProductionOpRecord) => {
    if (r.docNo && validDocNoRe.test(r.docNo)) return r.docNo;
    return reworkDisplayDocNoMap.get(r.id) ?? (() => {
      const d = r.timestamp ? new Date(r.timestamp) : new Date();
      const dateStr = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0].replace(/-/g, '') : d.toISOString().split('T')[0].replace(/-/g, '');
      return `FG${dateStr}-0001`;
    })();
  };

  const f = reworkFlowFilter;
  const filtered = useMemo(() => reworkRecords.filter(r => {
    const order = orders.find(o => o.id === r.orderId);
    const product = products.find(p => p.id === r.productId);
    const nodeName = r.nodeId ? (globalNodes.find(n => n.id === r.nodeId)?.name ?? '') : '';
    if (f.dateFrom || f.dateTo) {
      const dateStr = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : '';
      if (f.dateFrom && dateStr < f.dateFrom) return false;
      if (f.dateTo && dateStr > f.dateTo) return false;
    }
    if (f.orderNumber && !(order?.orderNumber ?? '').toLowerCase().includes(f.orderNumber.toLowerCase())) return false;
    if (f.productId) {
      const name = (product?.name ?? '').toLowerCase();
      const kw = f.productId.toLowerCase();
      if (!name.includes(kw) && !(r.productId ?? '').toLowerCase().includes(kw)) return false;
    }
    if (f.nodeName && !nodeName.toLowerCase().includes(f.nodeName.toLowerCase())) return false;
    if (f.operator && !(r.operator ?? '').toLowerCase().includes(f.operator.toLowerCase())) return false;
    if (f.reportNo) {
      const key = getDisplayDocNo(r).toLowerCase();
      if (!key.includes(f.reportNo.toLowerCase())) return false;
    }
    return true;
  }), [reworkRecords, f, orders, products, globalNodes, reworkDisplayDocNoMap]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()), [filtered]);
  const totalQuantity = useMemo(() => sorted.reduce((s, r) => s + (r.quantity ?? 0), 0), [sorted]);
  const totalAmount = useMemo(() => sorted.reduce((s, r) => s + (r.amount ?? 0), 0), [sorted]);
  const hasAnyPrice = useMemo(() => sorted.some(r => r.unitPrice != null && r.unitPrice > 0), [sorted]);
  const uniqueNodeNames = useMemo(() => [...new Set(reworkRecords.map(r => globalNodes.find(n => n.id === r.nodeId)?.name).filter(Boolean))] as string[], [reworkRecords, globalNodes]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-indigo-600" /> 返工报工流水</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <p className="text-xs text-slate-500">仅显示每次在工序上做返工报工产生的流水，报一次产生一条（新单据号）。按报工时间排序。</p>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
          </div>
          <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${productionLinkMode === 'product' ? 'md:grid-cols-6' : 'md:grid-cols-7'}`}>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
              <input type="date" value={f.dateFrom} onChange={e => setReworkFlowFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
              <input type="date" value={f.dateTo} onChange={e => setReworkFlowFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            {productionLinkMode !== 'product' && (
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label>
              <input type="text" value={f.orderNumber} onChange={e => setReworkFlowFilter(prev => ({ ...prev, orderNumber: e.target.value }))} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
              <input type="text" value={f.productId} onChange={e => setReworkFlowFilter(prev => ({ ...prev, productId: e.target.value }))} placeholder="产品名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">工序</label>
              <select value={f.nodeName} onChange={e => setReworkFlowFilter(prev => ({ ...prev, nodeName: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="">全部</option>
                {uniqueNodeNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">报工单号</label>
              <input type="text" value={f.reportNo} onChange={e => setReworkFlowFilter(prev => ({ ...prev, reportNo: e.target.value }))} placeholder="FG+日期+序号 模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">操作人</label>
              <input type="text" value={f.operator} onChange={e => setReworkFlowFilter(prev => ({ ...prev, operator: e.target.value }))} placeholder="操作人模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <button type="button" onClick={() => setReworkFlowFilter({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', reportNo: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
            <span className="text-xs text-slate-400">共 {sorted.length} 条返工报工记录</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {sorted.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无返工报工流水</p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                    {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">报工单号</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                    {hasAnyPrice && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">单价</th>}
                    {hasAnyPrice && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">金额</th>}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => {
                    const order = orders.find(o => o.id === r.orderId);
                    const product = products.find(p => p.id === r.productId);
                    const nodeName = r.nodeId ? (globalNodes.find(n => n.id === r.nodeId)?.name ?? '') : '—';
                    return (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.timestamp || '—'}</td>
                        {productionLinkMode !== 'product' && <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{order?.orderNumber ?? '—'}</td>}
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{getDisplayDocNo(r)}</td>
                        <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{product?.name ?? r.productId ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{nodeName}</td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">{r.quantity ?? 0} 件</td>
                        {hasAnyPrice && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{r.unitPrice != null && r.unitPrice > 0 ? r.unitPrice.toFixed(2) : '—'}</td>}
                        {hasAnyPrice && <td className="px-4 py-3 text-right font-bold text-amber-600 whitespace-nowrap">{r.amount != null && r.amount > 0 ? r.amount.toFixed(2) : '—'}</td>}
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.operator || '—'}</td>
                        <td className="px-4 py-3">
                          {hasOpsPerm(tenantRole, userPermissions, 'production:rework_report_records:view') && (
                            <button type="button" onClick={() => onViewDetail(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0">
                              <FileText className="w-3.5 h-3.5" /> 详情
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                    <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 4 : 5}></td>
                    <td className="px-4 py-3 text-indigo-600 text-right">{totalQuantity} 件</td>
                    {hasAnyPrice && <td className="px-4 py-3"></td>}
                    {hasAnyPrice && <td className="px-4 py-3 text-amber-600 text-right">{totalAmount.toFixed(2)}</td>}
                    <td className="px-4 py-3" colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReworkReportFlowListModal);
