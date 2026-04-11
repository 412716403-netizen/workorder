import React, { useState, useMemo } from 'react';
import { History, X, Filter, FileText } from 'lucide-react';
import { ProductionOpRecord, ProductionOrder, Product, GlobalNodeTemplate } from '../../types';
import { hasOpsPerm } from './types';
import { formatTimestamp } from '../../utils/formatTime';
import { toLocalCompactYmd, toLocalDateYmd } from '../../utils/localDateTime';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';

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
    const ds = toLocalCompactYmd(r.timestamp || new Date());
    return ds || toLocalCompactYmd(new Date());
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
      const dateStr = toLocalCompactYmd(r.timestamp || new Date()) || toLocalCompactYmd(new Date());
      return `FG${dateStr}-0001`;
    })();
  };

  const reworkById = useMemo(() => {
    const m = new Map<string, ProductionOpRecord>();
    (records || []).forEach(x => {
      if (x.type === 'REWORK' && x.id != null) m.set(String(x.id), x);
    });
    return m;
  }, [records]);

  const resolveReceiveFactory = (rr: ProductionOpRecord) => {
    const p = (rr.partner ?? '').trim();
    if (p) return p;
    const sid = rr.sourceReworkId;
    if (sid) {
      const src = reworkById.get(String(sid));
      const sp = (src?.partner ?? '').trim();
      if (sp) return sp;
    }
    return '—';
  };

  const f = reworkFlowFilter;
  const filtered = useMemo(() => reworkRecords.filter(r => {
    const order = orders.find(o => o.id === r.orderId);
    const product = products.find(p => p.id === r.productId);
    const nodeName = r.nodeId ? (globalNodes.find(n => n.id === r.nodeId)?.name ?? '') : '';
    if (f.dateFrom || f.dateTo) {
      const dateStr = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
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
    if (f.operator) {
      const kw = f.operator.toLowerCase();
      const opOk = (r.operator ?? '').toLowerCase().includes(kw);
      const partnerOk = (r.partner ?? '').toLowerCase().includes(kw);
      const src = r.sourceReworkId ? reworkById.get(String(r.sourceReworkId)) : undefined;
      const srcPartnerOk = (src?.partner ?? '').toLowerCase().includes(kw);
      if (!opOk && !partnerOk && !srcPartnerOk) return false;
    }
    if (f.reportNo) {
      const key = getDisplayDocNo(r).toLowerCase();
      if (!key.includes(f.reportNo.toLowerCase())) return false;
    }
    return true;
  }), [reworkRecords, f, orders, products, globalNodes, reworkDisplayDocNoMap, reworkById]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()),
    [filtered],
  );

  /** 标准 FG 单号 + 同一产品合并为一行（与返工报工详情批次一致） */
  const groupedRows = useMemo(() => {
    const groups = new Map<string, { records: ProductionOpRecord[]; totalQty: number; totalAmount: number; first: ProductionOpRecord }>();
    for (const r of sorted) {
      const mergeable = Boolean(r.docNo && validDocNoRe.test(r.docNo));
      const gKey = mergeable ? `${r.docNo}|${r.productId ?? ''}` : r.id;
      const amt = r.amount ?? 0;
      const existing = groups.get(gKey);
      if (existing) {
        existing.records.push(r);
        existing.totalQty += r.quantity ?? 0;
        existing.totalAmount += amt;
      } else {
        groups.set(gKey, { records: [r], totalQty: r.quantity ?? 0, totalAmount: amt, first: r });
      }
    }
    return [...groups.values()].sort((a, b) => {
      const d = flowRecordsEarliestMs(b.records) - flowRecordsEarliestMs(a.records);
      if (d !== 0) return d;
      return (a.first.id || '').localeCompare(b.first.id || '');
    });
  }, [sorted]);

  const totalQuantity = useMemo(() => groupedRows.reduce((s, g) => s + g.totalQty, 0), [groupedRows]);
  const totalAmount = useMemo(() => groupedRows.reduce((s, g) => s + g.totalAmount, 0), [groupedRows]);
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
          <p className="text-xs text-slate-500">返工报工流水；同一报工单号（FG）且同一产品的多条明细合并为一行显示。按单据创建时间倒序，编辑不改变顺序。</p>
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
              <input type="text" value={f.operator} onChange={e => setReworkFlowFilter(prev => ({ ...prev, operator: e.target.value }))} placeholder="操作人或收回工厂" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <button type="button" onClick={() => setReworkFlowFilter({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', reportNo: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
            <span className="text-xs text-slate-400">共 {groupedRows.length} 条（已合并同单号同产品）</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {groupedRows.length === 0 ? (
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
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">收回工厂</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                    {hasAnyPrice && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">单价</th>}
                    {hasAnyPrice && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">金额</th>}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map(({ first: r, records: groupRecs, totalQty, totalAmount }) => {
                    const order = orders.find(o => o.id === r.orderId);
                    const product = products.find(p => p.id === r.productId);
                    const nodeNames = [...new Set(groupRecs.map(x => x.nodeId ? (globalNodes.find(n => n.id === x.nodeId)?.name ?? '') : '').filter(Boolean))] as string[];
                    const nodeLabel = nodeNames.length === 0 ? '—' : nodeNames.length === 1 ? nodeNames[0]! : nodeNames.join('、');
                    const orderNumbers = productionLinkMode !== 'product'
                      ? [...new Set(groupRecs.map(x => orders.find(o => o.id === x.orderId)?.orderNumber).filter(Boolean))] as string[]
                      : [];
                    const orderLabel = productionLinkMode === 'product'
                      ? null
                      : orderNumbers.length <= 1
                        ? (order?.orderNumber ?? '—')
                        : `${orderNumbers[0]} 等${orderNumbers.length}单`;
                    const ops = [...new Set(groupRecs.map(x => (x.operator ?? '').trim()).filter(op => op && op !== '外协收回'))];
                    const opLabel = ops.length === 0 ? '—' : ops.length === 1 ? ops[0]! : `${ops[0]} 等${ops.length}人`;
                    const factoryLabels = [...new Set(groupRecs.map(resolveReceiveFactory).filter(x => x !== '—'))];
                    const factoryLabel = factoryLabels.length === 0 ? '—' : factoryLabels.length === 1 ? factoryLabels[0]! : factoryLabels.join('、');
                    const prices = groupRecs.map(x => x.unitPrice).filter((p): p is number => p != null && p > 0);
                    const unitLabel = prices.length === 0 ? '—' : prices.every(p => p === prices[0]) ? prices[0]!.toFixed(2) : '—';
                    const amtLabel = totalAmount > 0 ? totalAmount.toFixed(2) : '—';
                    const latestTs = groupRecs.reduce<{ t: number; ts?: string }>((best, x) => {
                      const t = new Date(x.timestamp || 0).getTime();
                      if (isNaN(t)) return best;
                      return t >= best.t ? { t, ts: x.timestamp } : best;
                    }, { t: -1 }).ts;
                    const rowKey = r.docNo && validDocNoRe.test(r.docNo) ? `${r.docNo}|${r.productId ?? ''}` : r.id;
                    return (
                      <tr key={rowKey} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatTimestamp(latestTs)}</td>
                        {productionLinkMode !== 'product' && (
                          <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap" title={orderNumbers.length > 1 ? orderNumbers.join('、') : undefined}>
                            {orderLabel}
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{getDisplayDocNo(r)}</td>
                        <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{product?.name ?? r.productId ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap max-w-[200px] truncate" title={nodeLabel}>{nodeLabel}</td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap max-w-[160px] truncate" title={factoryLabel !== '—' ? factoryLabel : undefined}>{factoryLabel}</td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">{totalQty} 件</td>
                        {hasAnyPrice && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{unitLabel}</td>}
                        {hasAnyPrice && <td className="px-4 py-3 text-right font-bold text-amber-600 whitespace-nowrap">{amtLabel}</td>}
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{opLabel}</td>
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
                    <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 5 : 6}></td>
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
