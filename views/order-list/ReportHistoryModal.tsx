
import React, { useState, useMemo } from 'react';
import { History, X, Filter, FileText } from 'lucide-react';
import {
  ProductionOrder,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  ProductMilestoneProgress,
  ProductionOpRecord,
} from '../../types';
import { toLocalDateYmd } from '../../utils/localDateTime';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';

function fmtDT(ts: string | Date | undefined | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

interface ReportHistoryModalProps {
  open: boolean;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  productionLinkMode: 'order' | 'product';
  productMilestoneProgresses: ProductMilestoneProgress[];
  prodRecords: ProductionOpRecord[];
  onOpenBatchDetail: (batch: any) => void;
}

const ReportHistoryModal: React.FC<ReportHistoryModalProps> = ({
  open,
  onClose,
  orders,
  products,
  globalNodes,
  dictionaries,
  productionLinkMode,
  productMilestoneProgresses,
  prodRecords,
  onOpenBatchDetail,
}) => {
  const [reportHistoryFilter, setReportHistoryFilter] = useState<{
    productId: string;
    orderNumber: string;
    milestoneName: string;
    operator: string;
    dateFrom: string;
    dateTo: string;
    reportNo: string;
  }>({ productId: '', orderNumber: '', milestoneName: '', operator: '', dateFrom: '', dateTo: '', reportNo: '' });

  const reportHistoryData = useMemo(() => {
    type ReportRow = {
      order: ProductionOrder;
      milestone: { id: string; name: string; templateId: string };
      report: {
        id: string; timestamp: string; operator: string; quantity: number;
        defectiveQuantity?: number; variantId?: string; reportBatchId?: string; reportNo?: string;
        [k: string]: any;
      };
    };
    const allRows: ReportRow[] = [];
    orders.forEach(o => {
      o.milestones?.forEach(m => {
        (m.reports || []).forEach(r => {
          allRows.push({ order: o, milestone: { id: m.id, name: m.name, templateId: m.templateId }, report: r });
        });
      });
    });
    type OrderBatch = { source: 'order'; key: string; rows: ReportRow[]; first: ReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string };
    type ProductBatchItem = { progress: ProductMilestoneProgress; report: ReportRow['report'] };
    type ProductBatch = { source: 'product'; key: string; progressId: string; productId: string; productName: string; milestoneName: string; milestoneTemplateId: string; rows: ProductBatchItem[]; first: ProductBatchItem; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string };
    const f = reportHistoryFilter;
    const isOutsourceReceiveReport = (report: ReportRow['report']) =>
      report.customData?.source === 'outsourceReceive' ||
      report.operator === '外协收回' ||
      (typeof report.reportNo === 'string' && report.reportNo.startsWith('外协收回·'));
    const outsourceReceiveDocKey = (report: ReportRow['report']) => {
      const rn = report.reportNo || '';
      if (rn.startsWith('外协收回·')) return rn.slice(5);
      return (report.customData?.docNo as string) || rn || report.id;
    };
    const filteredOrderRows = allRows.filter(({ order, milestone, report }) => {
      if (f.productId) {
        const p = products.find(px => px.id === order.productId);
        const name = (p?.name || '').toLowerCase();
        const kw = f.productId.toLowerCase();
        if (!name.includes(kw) && !order.productId.toLowerCase().includes(kw)) return false;
      }
      if (productionLinkMode !== 'product' && f.orderNumber && !order.orderNumber?.toLowerCase().includes(f.orderNumber.toLowerCase())) return false;
      if (f.milestoneName && !milestone.name?.toLowerCase().includes(f.milestoneName.toLowerCase())) return false;
      if (f.operator && !report.operator?.toLowerCase().includes(f.operator.toLowerCase())) return false;
      if (f.reportNo) {
        const kw = f.reportNo.toLowerCase();
        const key = (report.reportNo || report.reportBatchId || report.id).toLowerCase();
        if (!key.includes(kw)) return false;
      }
      if (f.dateFrom || f.dateTo) {
        const dateStr = toLocalDateYmd(report.timestamp);
        if (f.dateFrom && dateStr < f.dateFrom) return false;
        if (f.dateTo && dateStr > f.dateTo) return false;
      }
      return true;
    });
    const groupKeyOrder = (r: ReportRow) => {
      if (isOutsourceReceiveReport(r.report)) {
        return `wxrecv:${r.order.id}:${r.order.productId}:${outsourceReceiveDocKey(r.report)}`;
      }
      return r.report.reportBatchId || r.report.id;
    };
    const orderGroups = new Map<string, ReportRow[]>();
    filteredOrderRows.forEach(r => {
      const k = groupKeyOrder(r);
      if (!orderGroups.has(k)) orderGroups.set(k, []);
      orderGroups.get(k)!.push(r);
    });
    const orderBatches: OrderBatch[] = Array.from(orderGroups.entries()).map(([k, rows]) => ({
      source: 'order' as const, key: k, rows, first: rows[0],
      totalGood: rows.reduce((s, r) => s + r.report.quantity, 0),
      totalDefective: rows.reduce((s, r) => s + (r.report.defectiveQuantity ?? 0), 0),
      totalAmount: rows.reduce((s, r) => {
        const p = products.find(px => px.id === r.order.productId);
        const rate = r.report.rate ?? p?.nodeRates?.[r.milestone.templateId] ?? 0;
        return s + r.report.quantity * rate;
      }, 0),
      reportNo: rows.find(r => r.report.reportBatchId || r.report.reportNo)?.report.reportNo
    }));
    let productBatches: ProductBatch[] = [];
    if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0) {
      const productRows: ProductBatchItem[] = [];
      productMilestoneProgresses.forEach(pmp => {
        (pmp.reports ?? []).forEach(r => { productRows.push({ progress: pmp, report: r }); });
      });
      const filteredProductRows = productRows.filter(({ progress, report }) => {
        if (f.productId) {
          const p = products.find(px => px.id === progress.productId);
          const name = (p?.name || '').toLowerCase();
          const kw = f.productId.toLowerCase();
          if (!name.includes(kw) && !progress.productId.toLowerCase().includes(kw)) return false;
        }
        const mn = globalNodes.find(n => n.id === progress.milestoneTemplateId)?.name ?? '';
        if (f.milestoneName && !mn.toLowerCase().includes(f.milestoneName.toLowerCase())) return false;
        if (f.operator && !report.operator?.toLowerCase().includes(f.operator.toLowerCase())) return false;
        if (f.reportNo) {
          const kw = f.reportNo.toLowerCase();
          const key = (report.reportNo || report.reportBatchId || report.id).toLowerCase();
          if (!key.includes(kw)) return false;
        }
        if (f.dateFrom || f.dateTo) {
          const dateStr = toLocalDateYmd(report.timestamp);
          if (f.dateFrom && dateStr < f.dateFrom) return false;
          if (f.dateTo && dateStr > f.dateTo) return false;
        }
        return true;
      });
      const productGroupKey = (item: ProductBatchItem) => {
        const r = item.report;
        if (isOutsourceReceiveReport(r)) return `wxrecv:${item.progress.productId}:${outsourceReceiveDocKey(r)}`;
        return r.reportBatchId || r.id;
      };
      const productGroups = new Map<string, ProductBatchItem[]>();
      filteredProductRows.forEach(item => {
        const k = productGroupKey(item);
        if (!productGroups.has(k)) productGroups.set(k, []);
        productGroups.get(k)!.push(item);
      });
      productBatches = Array.from(productGroups.entries()).map(([k, rows]) => {
        const first = rows[0];
        const p = products.find(px => px.id === first.progress.productId);
        const defaultRate = p?.nodeRates?.[first.progress.milestoneTemplateId] ?? 0;
        return {
          source: 'product' as const, key: `product-${k}`, progressId: first.progress.id,
          productId: first.progress.productId, productName: p?.name ?? '',
          milestoneName: globalNodes.find(n => n.id === first.progress.milestoneTemplateId)?.name ?? '',
          milestoneTemplateId: first.progress.milestoneTemplateId,
          rows, first,
          totalGood: rows.reduce((s, x) => s + x.report.quantity, 0),
          totalDefective: rows.reduce((s, x) => s + (x.report.defectiveQuantity ?? 0), 0),
          totalAmount: rows.reduce((s, x) => s + x.report.quantity * (x.report.rate ?? defaultRate), 0),
          reportNo: rows.find(r => r.report.reportBatchId || r.report.reportNo)?.report.reportNo
        };
      });
    }
    const batchEarliestMs = (batch: OrderBatch | ProductBatch): number =>
      flowRecordsEarliestMs(batch.rows.map(r => ({ timestamp: r.report.timestamp })));
    const batches: (OrderBatch | ProductBatch)[] = [...orderBatches, ...productBatches].sort((a, b) => {
      const d = batchEarliestMs(b) - batchEarliestMs(a);
      if (d !== 0) return d;
      return String(a.key).localeCompare(String(b.key));
    });
    const totalGood = batches.reduce((s, b) => s + b.totalGood, 0);
    const totalDefective = batches.reduce((s, b) => s + b.totalDefective, 0);
    const totalAmount = batches.reduce((s, b) => s + b.totalAmount, 0);
    const getUnitName = (pid: string) => {
      const p = products.find(px => px.id === pid);
      return (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
    };
    const firstBatchProductId = batches.length > 0 ? (batches[0].source === 'order' ? batches[0].first.order.productId : batches[0].productId) : '';
    const summaryUnit = batches.length > 0 && batches.every(b => (b.source === 'order' ? b.first.order.productId : b.productId) === firstBatchProductId)
      ? getUnitName(firstBatchProductId) : '件';
    const uniqueProducts = [...new Set([...orders.map(o => o.productId), ...productMilestoneProgresses.map(p => p.productId)])].filter(Boolean);
    const uniqueMilestones = [...new Set([...allRows.map(r => r.milestone.name), ...productBatches.map(b => b.milestoneName)])].filter(Boolean);
    const uniqueOperators = [...new Set([...allRows.map(r => r.report.operator), ...productBatches.flatMap(b => b.rows.map(r => r.report.operator))])].filter(Boolean).sort((a, b) => a.localeCompare(b));
    return { batches, totalGood, totalDefective, totalAmount, summaryUnit, uniqueProducts, uniqueMilestones, uniqueOperators, getUnitName };
  }, [orders, products, productMilestoneProgresses, reportHistoryFilter, productionLinkMode, globalNodes, dictionaries]);

  if (!open) return null;

  const { batches, totalGood, totalDefective, totalAmount, summaryUnit, uniqueMilestones, uniqueOperators, getUnitName } = reportHistoryData;
  const f = reportHistoryFilter;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-indigo-600" /> 报工流水</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
              <input type="date" value={f.dateFrom} onChange={e => setReportHistoryFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
              <input type="date" value={f.dateTo} onChange={e => setReportHistoryFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
              <input
                type="text"
                value={f.productId}
                onChange={e => setReportHistoryFilter(prev => ({ ...prev, productId: e.target.value }))}
                placeholder="产品名称模糊搜索"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">工序</label>
              <select value={f.milestoneName} onChange={e => setReportHistoryFilter(prev => ({ ...prev, milestoneName: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="">全部</option>
                {uniqueMilestones.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">报工单号</label>
              <input
                type="text"
                value={f.reportNo}
                onChange={e => setReportHistoryFilter(prev => ({ ...prev, reportNo: e.target.value }))}
                placeholder="BG2026... 模糊搜索"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {productionLinkMode !== 'product' && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label>
                <input
                  type="text"
                  value={f.orderNumber}
                  onChange={e => setReportHistoryFilter(prev => ({ ...prev, orderNumber: e.target.value }))}
                  placeholder="模糊搜索"
                  className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">操作人</label>
              <input
                type="text"
                value={f.operator}
                onChange={e => setReportHistoryFilter(prev => ({ ...prev, operator: e.target.value }))}
                placeholder="操作人模糊搜索"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <button onClick={() => setReportHistoryFilter({ productId: '', orderNumber: '', milestoneName: '', operator: '', dateFrom: '', dateTo: '', reportNo: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
            <span className="text-xs text-slate-400">共 {batches.length} 次报工</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {batches.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无报工流水</p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                    {productionLinkMode !== 'product' && (
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>
                    )}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">报工单号</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">良品</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">不良品</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(batch => {
                    const batchUnit = getUnitName(batch.source === 'order' ? batch.first.order.productId : batch.productId);
                    const rawKey = batch.source === 'product' && batch.key.startsWith('product-') ? batch.key.slice('product-'.length) : batch.key;
                    const reportNoRaw = batch.reportNo || rawKey;
                    const reportNo = reportNoRaw.startsWith('外协收回·') ? reportNoRaw.slice(5) : reportNoRaw;
                    return (
                      <tr key={batch.key} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDT(batch.first.report.timestamp)}</td>
                        {productionLinkMode !== 'product' && (
                          <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                            {batch.source === 'order' ? batch.first.order.orderNumber : '—'}
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{reportNo}</td>
                        <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{batch.source === 'order' ? batch.first.order.productName : batch.productName}</td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {batch.source === 'order' ? batch.first.milestone.name : batch.milestoneName}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600 text-right whitespace-nowrap">{batch.totalGood} {batchUnit}</td>
                        <td className="px-4 py-3 font-bold text-amber-600 text-right whitespace-nowrap">{batch.totalDefective > 0 ? `${batch.totalDefective} ${batchUnit}` : '—'}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{batch.first.report.operator}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => onOpenBatchDetail({ ...batch })}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                          >
                            <FileText className="w-3.5 h-3.5" /> 详情
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                    <td className="px-4 py-3" colSpan={productionLinkMode !== 'product' ? 5 : 4}></td>
                    <td className="px-4 py-3 text-emerald-600 text-right">{totalGood} {summaryUnit}</td>
                    <td className="px-4 py-3 text-amber-600 text-right">{totalDefective > 0 ? `${totalDefective} ${summaryUnit}` : '—'}</td>
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

export default React.memo(ReportHistoryModal);
