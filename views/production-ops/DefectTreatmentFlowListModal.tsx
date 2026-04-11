import React, { useState, useMemo } from 'react';
import { ScrollText, X, Filter, FileText } from 'lucide-react';
import { ProductionOpRecord, ProductionOrder, Product, GlobalNodeTemplate } from '../../types';
import { hasOpsPerm } from './types';
import { formatTimestamp } from '../../utils/formatTime';
import { toLocalDateYmd } from '../../utils/localDateTime';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';

export interface DefectTreatmentFlowListModalProps {
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

const DefectTreatmentFlowListModal: React.FC<DefectTreatmentFlowListModalProps> = ({
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
  const [defectFlowFilter, setDefectFlowFilter] = useState<{ dateFrom: string; dateTo: string; orderNumber: string; productId: string; nodeName: string; operator: string; recordType: string }>({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', recordType: '' });

  const defectRecords = useMemo(() => (records || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK' || r.type === 'SCRAP'), [records]);

  const f = defectFlowFilter;
  const filtered = useMemo(() => defectRecords.filter(r => {
    const order = orders.find(o => o.id === r.orderId);
    const product = products.find(p => p.id === r.productId);
    const sourceNodeId = r.type === 'REWORK' ? (r.sourceNodeId ?? r.nodeId) : r.nodeId;
    const nodeName = sourceNodeId ? (globalNodes.find(n => n.id === sourceNodeId)?.name ?? '') : '';
    if (f.dateFrom || f.dateTo) { const dateStr = r.timestamp ? toLocalDateYmd(r.timestamp) : ''; if (f.dateFrom && dateStr < f.dateFrom) return false; if (f.dateTo && dateStr > f.dateTo) return false; }
    if (f.orderNumber && !(order?.orderNumber ?? '').toLowerCase().includes(f.orderNumber.toLowerCase())) return false;
    if (f.productId) { const name = (product?.name ?? '').toLowerCase(); const kw = f.productId.toLowerCase(); if (!name.includes(kw) && !(r.productId ?? '').toLowerCase().includes(kw)) return false; }
    if (f.nodeName && !nodeName.toLowerCase().includes(f.nodeName.toLowerCase())) return false;
    if (f.operator && !(r.operator ?? '').toLowerCase().includes(f.operator.toLowerCase())) return false;
    const isOutsource = r.type === 'REWORK' && ((r.partner ?? '').trim() !== '' || r.status === '委外返工中');
    if (f.recordType === 'REWORK' && (r.type !== 'REWORK' || isOutsource)) return false;
    if (f.recordType === 'REWORK_OUTSOURCE' && !isOutsource) return false;
    if (f.recordType === 'SCRAP' && r.type !== 'SCRAP') return false;
    return true;
  }), [defectRecords, f, orders, products, globalNodes]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()),
    [filtered],
  );

  const groupedRows = useMemo(() => {
    const groups = new Map<string, { key: string; records: ProductionOpRecord[]; totalQty: number; first: ProductionOpRecord }>();
    for (const r of sorted) {
      const gKey = r.docNo ? `${r.docNo}|${r.productId}` : r.id;
      const existing = groups.get(gKey);
      if (existing) {
        existing.records.push(r);
        existing.totalQty += r.quantity ?? 0;
      } else {
        groups.set(gKey, { key: gKey, records: [r], totalQty: r.quantity ?? 0, first: r });
      }
    }
    return [...groups.values()].sort((a, b) => {
      const d = flowRecordsEarliestMs(b.records) - flowRecordsEarliestMs(a.records);
      if (d !== 0) return d;
      return (a.key || '').localeCompare(b.key || '');
    });
  }, [sorted]);

  const totalQuantity = useMemo(() => groupedRows.reduce((s, g) => s + g.totalQty, 0), [groupedRows]);
  const uniqueNodeNames = useMemo(() => [...new Set(defectRecords.map(r => { const sid = r.type === 'REWORK' ? (r.sourceNodeId ?? r.nodeId) : r.nodeId; return sid ? (globalNodes.find(n => n.id === sid)?.name ?? '') : ''; }).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string)) as string[], [defectRecords, globalNodes]);

  const getSourceNodeName = (rec: ProductionOpRecord) => { const sid = rec.type === 'REWORK' ? (rec.sourceNodeId ?? rec.nodeId) : rec.nodeId; return sid ? (globalNodes.find(n => n.id === sid)?.name ?? sid) : '—'; };
  const getDocNo = (rec: ProductionOpRecord) => (rec.docNo) ? rec.docNo : '—';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 处理不良品流水</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0"><p className="text-xs text-slate-500">生成返工、报损等处理不良品的记录。按单据创建时间倒序，编辑不改变顺序。</p></div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3"><Filter className="w-4 h-4 text-slate-500" /><span className="text-xs font-bold text-slate-500 uppercase">筛选</span></div>
          <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${productionLinkMode === 'product' ? 'md:grid-cols-7' : 'md:grid-cols-8'}`}>
            <div><label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label><input type="date" value={f.dateFrom} onChange={e => setDefectFlowFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>
            <div><label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label><input type="date" value={f.dateTo} onChange={e => setDefectFlowFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>
            {productionLinkMode !== 'product' && (<div><label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label><input type="text" value={f.orderNumber} onChange={e => setDefectFlowFilter(prev => ({ ...prev, orderNumber: e.target.value }))} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>)}
            <div><label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label><input type="text" value={f.productId} onChange={e => setDefectFlowFilter(prev => ({ ...prev, productId: e.target.value }))} placeholder="产品名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>
            <div><label className="text-[10px] font-bold text-slate-400 block mb-1">来源工序</label><select value={f.nodeName} onChange={e => setDefectFlowFilter(prev => ({ ...prev, nodeName: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"><option value="">全部</option>{uniqueNodeNames.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
            <div><label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label><select value={f.recordType} onChange={e => setDefectFlowFilter(prev => ({ ...prev, recordType: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"><option value="">全部</option><option value="REWORK">返工</option><option value="REWORK_OUTSOURCE">委外返工</option><option value="SCRAP">报损</option></select></div>
            <div><label className="text-[10px] font-bold text-slate-400 block mb-1">操作人</label><input type="text" value={f.operator} onChange={e => setDefectFlowFilter(prev => ({ ...prev, operator: e.target.value }))} placeholder="操作人模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <button type="button" onClick={() => setDefectFlowFilter({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', recordType: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
            <span className="text-xs text-slate-400">共 {groupedRows.length} 条记录{groupedRows.length !== sorted.length ? `（${sorted.length} 笔明细）` : ''}</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {groupedRows.length === 0 ? (<p className="text-slate-500 text-center py-12">暂无处理不良品流水</p>) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                  {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">来源工序</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                </tr></thead>
                <tbody>
                  {groupedRows.map(({ key: gKey, first: r, totalQty, records: groupRecs }) => {
                    const order = orders.find(o => o.id === r.orderId);
                    const product = products.find(p => p.id === r.productId);
                    const isOutsourceRework = r.type === 'REWORK' && ((r.partner ?? '').trim() !== '' || r.status === '委外返工中');
                    const typeLabel = r.type === 'REWORK' ? (isOutsourceRework ? '委外返工' : '返工') : '报损';
                    const partnerLabels = [...new Set(
                      groupRecs
                        .filter(x => x.type === 'REWORK' && ((x.partner ?? '').trim() !== '' || x.status === '委外返工中'))
                        .map(x => (x.partner ?? '').trim())
                        .filter(Boolean)
                    )] as string[];
                    const partnerLabel = partnerLabels.length === 0 ? '—' : partnerLabels.length === 1 ? partnerLabels[0]! : partnerLabels.join('、');
                    const orderNumbers = productionLinkMode !== 'product' && groupRecs.length > 1
                      ? [...new Set(groupRecs.map(x => orders.find(o => o.id === x.orderId)?.orderNumber).filter(Boolean))]
                      : null;
                    return (
                      <tr key={gKey} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatTimestamp(r.timestamp)}</td>
                        {productionLinkMode !== 'product' && (
                          <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap" title={orderNumbers ? orderNumbers.join('、') : undefined}>
                            {orderNumbers && orderNumbers.length > 1 ? `${orderNumbers[0]} 等${orderNumbers.length}单` : order?.orderNumber ?? '—'}
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{getDocNo(r)}</td>
                        <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{product?.name ?? r.productId ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{getSourceNodeName(r)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={r.type === 'REWORK' ? 'text-indigo-600 font-bold' : 'text-rose-600 font-bold'}>{typeLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap max-w-[160px] truncate" title={partnerLabel !== '—' ? partnerLabel : undefined}>{partnerLabel}</td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">{totalQty} 件</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{(r.operator ?? '').trim() && (r.operator ?? '').trim() !== '外协收回' ? r.operator : '—'}</td>
                        <td className="px-4 py-3">
                          {hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:view') && (
                            <button type="button" onClick={() => onViewDetail(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"><FileText className="w-3.5 h-3.5" /> 详情</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                    <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 6 : 7}></td>
                    <td className="px-4 py-3 text-indigo-600 text-right">{totalQuantity} 件</td>
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

export default React.memo(DefectTreatmentFlowListModal);
