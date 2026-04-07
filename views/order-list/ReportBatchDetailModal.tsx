
import React, { useState, useMemo } from 'react';
import { X, Trash2, Check, Pencil } from 'lucide-react';
import {
  ProductionOrder,
  Product,
  ProductCategory,
  GlobalNodeTemplate,
  AppDictionaries,
  Worker,
  ProductMilestoneProgress,
  ProductionOpRecord,
  ProcessSequenceMode,
} from '../../types';
import WorkerSelector from '../../components/WorkerSelector';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import { useConfirm } from '../../contexts/ConfirmContext';

function fmtDT(ts: string | Date | undefined | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

type OrderReportRow = {
  order: ProductionOrder;
  milestone: { id: string; name: string; templateId: string };
  report: {
    id: string; timestamp: string; operator: string; quantity: number;
    defectiveQuantity?: number; variantId?: string; reportBatchId?: string; reportNo?: string;
    [k: string]: any;
  };
};
type ProductReportRow = { progress: ProductMilestoneProgress; report: OrderReportRow['report'] };

export type ReportDetailBatch =
  | { source: 'order'; key: string; rows: OrderReportRow[]; first: OrderReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string }
  | { source: 'product'; key: string; progressId: string; productId: string; productName: string; milestoneName: string; milestoneTemplateId: string; rows: ProductReportRow[]; first: ProductReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string };

type ReportUpdateParams = {
  orderId: string;
  milestoneId: string;
  reportId: string;
  quantity: number;
  defectiveQuantity?: number;
  timestamp?: string;
  operator?: string;
  newOrderId?: string;
  newMilestoneId?: string;
};

interface ReportBatchDetailModalProps {
  batch: ReportDetailBatch;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  workers: Worker[];
  prodRecords: ProductionOpRecord[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  processSequenceMode: ProcessSequenceMode;
  productionLinkMode: 'order' | 'product';
  onUpdateReport?: (params: ReportUpdateParams) => void;
  onDeleteReport?: (params: { orderId: string; milestoneId: string; reportId: string }) => void;
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
  onUpdateProduct?: (product: Product) => Promise<boolean>;
  hasOrderPerm: (permKey: string) => boolean;
}

const ReportBatchDetailModal: React.FC<ReportBatchDetailModalProps> = ({
  batch: reportDetailBatch,
  onClose,
  orders,
  products,
  categories,
  dictionaries,
  globalNodes,
  workers,
  prodRecords,
  productMilestoneProgresses,
  processSequenceMode,
  productionLinkMode,
  onUpdateReport,
  onDeleteReport,
  onUpdateReportProduct,
  onDeleteReportProduct,
  onUpdateProduct,
  hasOrderPerm,
}) => {
  const confirm = useConfirm();
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const defectiveAndReworkByOrderMilestone = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, prodRecords),
    [orders, prodRecords]
  );
  const getDefectiveRework = (orderId: string, templateId: string) =>
    defectiveAndReworkByOrderMilestone.get(`${orderId}|${templateId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };

  const [editingReport, setEditingReport] = useState<{
    orderId: string;
    milestoneId: string;
    templateId: string;
    productId: string;
    form: {
      timestamp: string;
      operator: string;
      workerId: string;
      rate: number;
      rowEdits: {
        reportId: string;
        orderId: string;
        milestoneId: string;
        progressId?: string;
        quantity: number;
        defectiveQuantity: number;
      }[];
    };
  } | null>(null);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { onClose(); setEditingReport(null); }} />
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
              {reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.orderNumber : '产品'}
            </span>
            报工详情
          </h3>
          <div className="flex items-center gap-2">
            {editingReport ? (
              <>
                <button onClick={() => setEditingReport(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                <button
                  onClick={() => {
                    const f = editingReport.form;
                    const ts = new Date(f.timestamp);
                    const tsStr = isNaN(ts.getTime()) ? new Date().toLocaleString() : ts.toLocaleString();
                    if (reportDetailBatch.source === 'order' && onUpdateReport) {
                      const origMilestoneId = reportDetailBatch.first.milestone.id;
                      const changedMilestone = editingReport.milestoneId !== origMilestoneId;
                      f.rowEdits.forEach(row => {
                        onUpdateReport({
                          orderId: row.orderId,
                          milestoneId: row.milestoneId,
                          reportId: row.reportId,
                          quantity: Math.max(0, row.quantity),
                          defectiveQuantity: Math.max(0, row.defectiveQuantity),
                          timestamp: tsStr,
                          operator: f.operator,
                          newMilestoneId: changedMilestone ? editingReport.milestoneId : undefined
                        });
                      });
                    } else if (reportDetailBatch.source === 'product' && onUpdateReportProduct) {
                      const origTemplateId = reportDetailBatch.milestoneTemplateId;
                      const changedTemplate = editingReport.templateId !== origTemplateId;
                      f.rowEdits.forEach(row => {
                        if (!row.progressId) return;
                        onUpdateReportProduct({
                          progressId: row.progressId,
                          reportId: row.reportId,
                          quantity: Math.max(0, row.quantity),
                          defectiveQuantity: Math.max(0, row.defectiveQuantity),
                          timestamp: tsStr,
                          operator: f.operator,
                          newMilestoneTemplateId: changedTemplate ? editingReport.templateId : undefined
                        });
                      });
                    }
                    if (onUpdateProduct && f.rate >= 0) {
                      const product = productMap.get(editingReport.productId);
                      if (product) {
                        onUpdateProduct({
                          ...product,
                          nodeRates: { ...(product.nodeRates || {}), [editingReport.templateId]: f.rate }
                        });
                      }
                    }
                    setEditingReport(null);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <Check className="w-4 h-4" /> 保存
                </button>
              </>
            ) : (
              <>
                {reportDetailBatch.source === 'order' && onUpdateReport && reportDetailBatch.rows.length > 0 && hasOrderPerm('production:orders_report_records:edit') && (
                  <button
                    type="button"
                    onClick={() => {
                      const { order, milestone, report } = reportDetailBatch.rows[0];
                      const ts = report.timestamp;
                      let dt = new Date(ts);
                      if (isNaN(dt.getTime())) dt = new Date();
                      const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                      const product = productMap.get(order.productId);
                      const rate = product?.nodeRates?.[milestone.templateId] ?? 0;
                      const matchingWorker = workers.find(w => w.name === report.operator);
                      setEditingReport({
                        orderId: order.id,
                        milestoneId: milestone.id,
                        templateId: milestone.templateId,
                        productId: order.productId,
                        form: {
                          timestamp: tsStr,
                          operator: report.operator,
                          workerId: matchingWorker?.id || '',
                          rate,
                          rowEdits: reportDetailBatch.rows.map(({ order: o, milestone: m, report: r }) => ({
                            reportId: r.id,
                            orderId: o.id,
                            milestoneId: m.id,
                            quantity: r.quantity,
                            defectiveQuantity: r.defectiveQuantity ?? 0
                          }))
                        }
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <Pencil className="w-4 h-4" /> 编辑
                  </button>
                )}
                {reportDetailBatch.source === 'product' && onUpdateReportProduct && reportDetailBatch.rows.length > 0 && hasOrderPerm('production:orders_report_records:edit') && (
                  <button
                    type="button"
                    onClick={() => {
                      const { progress, report } = reportDetailBatch.rows[0];
                      const ts = report.timestamp;
                      let dt = new Date(ts);
                      if (isNaN(dt.getTime())) dt = new Date();
                      const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                      const product = productMap.get(progress.productId);
                      const rate = product?.nodeRates?.[progress.milestoneTemplateId] ?? 0;
                      const matchingWorker = workers.find(w => w.name === report.operator);
                      setEditingReport({
                        orderId: '',
                        milestoneId: '',
                        templateId: progress.milestoneTemplateId,
                        productId: progress.productId,
                        form: {
                          timestamp: tsStr,
                          operator: report.operator,
                          workerId: matchingWorker?.id || '',
                          rate,
                          rowEdits: reportDetailBatch.rows.map(({ progress: pr, report: r }) => ({
                            reportId: r.id,
                            orderId: '',
                            milestoneId: '',
                            progressId: pr.id,
                            quantity: r.quantity,
                            defectiveQuantity: r.defectiveQuantity ?? 0
                          }))
                        }
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <Pencil className="w-4 h-4" /> 编辑
                  </button>
                )}
                {reportDetailBatch.source === 'order' && onDeleteReport && hasOrderPerm('production:orders_report_records:delete') && (
                  <button
                    type="button"
                    onClick={() => {
                      void confirm({ message: '确定要删除该次报工的所有记录吗？此操作不可恢复。', danger: true }).then((ok) => {
                        if (!ok) return;
                        reportDetailBatch.rows.forEach(({ order, milestone, report }) => {
                          onDeleteReport({ orderId: order.id, milestoneId: milestone.id, reportId: report.id });
                        });
                        setEditingReport(null);
                        onClose();
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                  >
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                )}
                {reportDetailBatch.source === 'product' && onDeleteReportProduct && hasOrderPerm('production:orders_report_records:delete') && (
                  <button
                    type="button"
                    onClick={() => {
                      void confirm({ message: '确定要删除该次报工的所有记录吗？此操作不可恢复。', danger: true }).then((ok) => {
                        if (!ok) return;
                        reportDetailBatch.rows.forEach(({ progress, report }) => {
                          onDeleteReportProduct({ progressId: progress.id, reportId: report.id });
                        });
                        setEditingReport(null);
                        onClose();
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                  >
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                )}
              </>
            )}
            <button onClick={() => { onClose(); setEditingReport(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">{reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.productName : reportDetailBatch.productName}</h2>
          {editingReport ? (() => {
            const order = reportDetailBatch.source === 'order' ? orders.find(o => o.id === editingReport.orderId) : null;
            const milestone = order?.milestones.find(m => m.templateId === editingReport.templateId);
            const tid = editingReport.templateId;
            const orderTotal = order ? order.items.reduce((s, i) => s + i.quantity, 0) : 0;
            const totalBase = order && milestone && processSequenceMode === 'sequential'
              ? (() => { const idx = order.milestones.findIndex(m => m.templateId === tid); if (idx <= 0) return orderTotal; const prev = order.milestones[idx - 1]; return prev?.completedQuantity ?? 0; })()
              : (orderTotal || 0);
            const { defective: totalDefective, rework: totalRework } = order ? getDefectiveRework(order.id, tid) : { defective: 0, rework: 0 };
            const totalCompleted = milestone?.completedQuantity ?? 0;
            const outsourcedPendingEdit = order ? prodRecords.filter(
              r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === order.id && r.nodeId === tid
            ).reduce((s, r) => s + (r.quantity ?? 0), 0) : 0;
            const effectiveRemainingSaved = Math.max(0, totalBase - totalDefective + totalRework - totalCompleted - outsourcedPendingEdit);
            const batchDefectiveSum = editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
            const maxBatchGood = effectiveRemainingSaved + reportDetailBatch.totalGood + reportDetailBatch.totalDefective - batchDefectiveSum;
            return (
            <>
              {reportDetailBatch.source === 'order' && order && (
                <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2">
                  本工序可报最多 <span className="font-bold text-indigo-600">{effectiveRemainingSaved}</span> 件（已扣不良、加返工）；当前批良品合计不超过 <span className="font-bold text-indigo-600">{Math.max(0, maxBatchGood)}</span> 件
                </div>
              )}
              <div className="grid grid-cols-[1fr_1.5fr_2.5fr] gap-3">
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">工序</p>
                  <select
                    value={editingReport.templateId}
                    onChange={e => {
                      const newTemplateId = e.target.value;
                      const product = productMap.get(editingReport.productId);
                      const newRate = product?.nodeRates?.[newTemplateId] ?? 0;
                      if (reportDetailBatch.source === 'order') {
                        const order = orders.find(o => o.id === editingReport.orderId);
                        const newMilestone = order?.milestones.find(m => m.templateId === newTemplateId);
                        setEditingReport(prev => prev ? {
                          ...prev,
                          templateId: newTemplateId,
                          milestoneId: newMilestone?.id || prev.milestoneId,
                          form: { ...prev.form, rate: newRate }
                        } : prev);
                      } else {
                        setEditingReport(prev => prev ? {
                          ...prev,
                          templateId: newTemplateId,
                          form: { ...prev.form, rate: newRate }
                        } : prev);
                      }
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    {globalNodes.map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">报工时间</p>
                  <input
                    type="datetime-local"
                    value={editingReport.form.timestamp}
                    onChange={e => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">操作人</p>
                  <WorkerSelector
                    options={workers.filter(w => w.status === 'ACTIVE').map(w => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                    processNodes={globalNodes}
                    currentNodeId={editingReport.templateId}
                    value={editingReport.form.workerId}
                    onChange={(id) => {
                      const w = workers.find(wx => wx.id === id);
                      setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, workerId: id, operator: w?.name || prev.form.operator } } : prev);
                    }}
                    placeholder="选择操作人..."
                    variant="compact"
                  />
                </div>
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">良品</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">不良品</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">工价</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额(元)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportDetailBatch.source === 'order'
                      ? reportDetailBatch.rows.map(({ order, milestone, report }) => {
                          const rowEdit = editingReport.form.rowEdits.find(r => r.reportId === report.id);
                          if (!rowEdit) return null;
                          const otherGoodSum = editingReport.form.rowEdits.filter(r => r.reportId !== report.id).reduce((s, r) => s + r.quantity, 0);
                          const maxThisRow = Math.max(0, maxBatchGood - otherGoodSum);
                          const p = products.find(px => px.id === order.productId);
                          const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                          const variantSuffix = report.variantId && (() => {
                            const v = p?.variants?.find((x: { id: string }) => x.id === report.variantId);
                            return (v as { skuSuffix?: string })?.skuSuffix;
                          })();
                          const rate = editingReport.form.rate;
                          const amount = rowEdit.quantity * rate;
                          return (
                            <tr key={report.id} className="border-b border-slate-100">
                              <td className="px-4 py-3 text-slate-800">{variantSuffix || '—'}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={maxThisRow || undefined}
                                    title={maxBatchGood >= 0 ? `本批良品合计最多 ${maxBatchGood} 件` : ''}
                                    value={rowEdit.quantity}
                                    onChange={e => {
                                      const raw = parseInt(e.target.value) || 0;
                                      const v = maxBatchGood >= 0 ? Math.min(raw, maxThisRow) : raw;
                                      setEditingReport(prev => prev ? {
                                        ...prev,
                                        form: {
                                          ...prev.form,
                                          rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, quantity: v } : r)
                                        }
                                      } : prev);
                                    }}
                                    className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                  />
                                  <span className="text-slate-600 text-sm">{detailUnit}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    value={rowEdit.defectiveQuantity}
                                    onChange={e => {
                                      const v = Math.max(0, parseInt(e.target.value) || 0);
                                      setEditingReport(prev => {
                                        if (!prev) return prev;
                                        const nextEdits = prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, defectiveQuantity: v } : r);
                                        const newDefSum = nextEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
                                        const newMaxBatchGood = effectiveRemainingSaved + reportDetailBatch.totalGood + reportDetailBatch.totalDefective - newDefSum;
                                        const totalQty = nextEdits.reduce((s, r) => s + r.quantity, 0);
                                        if (totalQty > newMaxBatchGood && newMaxBatchGood >= 0) {
                                          const scale = totalQty > 0 ? newMaxBatchGood / totalQty : 0;
                                          const clamped = nextEdits.map(r => ({ ...r, quantity: Math.floor(r.quantity * scale) }));
                                          const remainder = newMaxBatchGood - clamped.reduce((s, r) => s + r.quantity, 0);
                                          const final = clamped.length > 0 && remainder > 0 ? clamped.map((r, i) => i === 0 ? { ...r, quantity: r.quantity + remainder } : r) : clamped;
                                          return { ...prev, form: { ...prev.form, rowEdits: final } };
                                        }
                                        return { ...prev, form: { ...prev.form, rowEdits: nextEdits } };
                                      });
                                    }}
                                    className="w-20 bg-amber-50/80 border border-amber-100 rounded-lg px-2 py-1 text-sm font-bold text-amber-800 text-right outline-none focus:ring-2 focus:ring-amber-200"
                                  />
                                  <span className="text-slate-600 text-sm">{detailUnit}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {reportDetailBatch.rows.findIndex(x => x.report.id === report.id) === 0 ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={editingReport.form.rate}
                                      onChange={e => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, rate: parseFloat(e.target.value) || 0 } } : prev)}
                                      className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                    <span className="text-slate-500 text-xs">元/{detailUnit}</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-600 text-sm">{editingReport.form.rate > 0 ? `${editingReport.form.rate.toFixed(2)} 元/${detailUnit}` : '—'}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-bold text-indigo-600 text-right">{amount >= 0 ? amount.toFixed(2) : '—'}</td>
                            </tr>
                          );
                        })
                      : reportDetailBatch.rows.map(({ progress, report }) => {
                          const rowEdit = editingReport.form.rowEdits.find(r => r.reportId === report.id);
                          if (!rowEdit) return null;
                          const p = products.find(px => px.id === progress.productId);
                          const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                          const variantSuffix = progress.variantId && (() => {
                            const v = p?.variants?.find((x: { id: string }) => x.id === progress.variantId);
                            return (v as { skuSuffix?: string })?.skuSuffix;
                          })();
                          const rate = editingReport.form.rate;
                          const amount = rowEdit.quantity * rate;
                          return (
                            <tr key={report.id} className="border-b border-slate-100">
                              <td className="px-4 py-3 text-slate-800">{variantSuffix || '—'}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    value={rowEdit.quantity}
                                    onChange={e => {
                                      const v = parseInt(e.target.value) || 0;
                                      setEditingReport(prev => prev ? {
                                        ...prev,
                                        form: {
                                          ...prev.form,
                                          rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, quantity: v } : r)
                                        }
                                      } : prev);
                                    }}
                                    className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                  />
                                  <span className="text-slate-600 text-sm">{detailUnit}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    value={rowEdit.defectiveQuantity}
                                    onChange={e => {
                                      const v = parseInt(e.target.value) || 0;
                                      setEditingReport(prev => prev ? {
                                        ...prev,
                                        form: {
                                          ...prev.form,
                                          rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, defectiveQuantity: v } : r)
                                        }
                                      } : prev);
                                    }}
                                    className="w-20 bg-amber-50/80 border border-amber-100 rounded-lg px-2 py-1 text-sm font-bold text-amber-800 text-right outline-none focus:ring-2 focus:ring-amber-200"
                                  />
                                  <span className="text-slate-600 text-sm">{detailUnit}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {reportDetailBatch.rows.findIndex(x => x.report.id === report.id) === 0 ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={editingReport.form.rate}
                                      onChange={e => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, rate: parseFloat(e.target.value) || 0 } } : prev)}
                                      className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                    <span className="text-slate-500 text-xs">元/{detailUnit}</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-600 text-sm">{editingReport.form.rate > 0 ? `${editingReport.form.rate.toFixed(2)} 元/${detailUnit}` : '—'}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-bold text-indigo-600 text-right">{amount >= 0 ? amount.toFixed(2) : '—'}</td>
                            </tr>
                          );
                        })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                      <td className="px-4 py-3">合计</td>
                      <td className="px-4 py-3 text-emerald-600 text-right">
                        {editingReport.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {(products.find(px => px.id === editingReport.productId)?.unitId && dictionaries?.units?.find(u => u.id === products.find(px => px.id === editingReport.productId)?.unitId)?.name) || '件'}
                      </td>
                      <td className="px-4 py-3 text-amber-600 text-right">
                        {(() => {
                          const totalDef = editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
                          const unitName = (products.find(px => px.id === editingReport.productId)?.unitId && dictionaries?.units?.find(u => u.id === products.find(px => px.id === editingReport.productId)?.unitId)?.name) || '件';
                          return totalDef > 0 ? `${totalDef} ${unitName}` : '—';
                        })()}
                      </td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-indigo-600 text-right">
                        {editingReport.form.rowEdits.reduce((s, r) => s + r.quantity * editingReport.form.rate, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          );
          })() : (
            <>
              <div className="flex flex-wrap gap-4">
                {(() => {
                  const productId = reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.productId : reportDetailBatch.productId;
                  const p = products.find(px => px.id === productId);
                  const unitName = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                  const milestoneName = reportDetailBatch.source === 'order'
                    ? reportDetailBatch.first.milestone.name
                    : reportDetailBatch.milestoneName;
                  const order = reportDetailBatch.source === 'order' ? reportDetailBatch.first.order : null;
                  const tid = reportDetailBatch.source === 'order' ? reportDetailBatch.first.milestone.templateId : reportDetailBatch.milestoneTemplateId;
                  const orderTotal = order ? order.items.reduce((s, i) => s + i.quantity, 0) : 0;
                  const ms = order?.milestones.find(m => m.templateId === tid);
                  const totalBase = order && ms && processSequenceMode === 'sequential'
                    ? (() => { const idx = order.milestones.findIndex(m => m.templateId === tid); if (idx <= 0) return orderTotal; const prev = order.milestones[idx - 1]; return prev?.completedQuantity ?? 0; })()
                    : (orderTotal || 0);
                  const { defective: drDef, rework: drRework } = order ? getDefectiveRework(order.id, tid) : { defective: 0, rework: 0 };
                  const outsourcedPendingView = order ? prodRecords.filter(
                    r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === order.id && r.nodeId === tid
                  ).reduce((s, r) => s + (r.quantity ?? 0), 0) : 0;
                  const effectiveRemainingView = order && ms ? Math.max(0, totalBase - drDef + drRework - (ms.completedQuantity ?? 0) - outsourcedPendingView) : null;
                  return (
                    <>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工序</p>
                        <p className="text-sm font-bold text-slate-800">{milestoneName || '—'}</p>
                      </div>
                      {effectiveRemainingView != null && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">本工序可报最多</p>
                          <p className="text-sm font-bold text-indigo-600">{effectiveRemainingView} {unitName} <span className="text-[10px] font-normal text-slate-400">（已扣不良、加返工、已外协）</span></p>
                        </div>
                      )}
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">本次报工量</p>
                        <p className="text-sm font-bold text-indigo-600">{reportDetailBatch.totalGood} {unitName}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">报工时间</p>
                        <p className="text-sm font-bold text-slate-800">{fmtDT(reportDetailBatch.first.report.timestamp)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">操作人</p>
                        <p className="text-sm font-bold text-slate-800">{reportDetailBatch.first.report.operator}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="flex-1 overflow-auto px-6 pb-6 -mt-2">
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">良品</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">不良品</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">工价</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额(元)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportDetailBatch.source === 'order'
                        ? reportDetailBatch.rows.map(({ order, milestone, report }) => {
                            const p = products.find(px => px.id === order.productId);
                            const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                            const variantSuffix = report.variantId && (() => {
                              const v = p?.variants?.find((x: { id: string }) => x.id === report.variantId);
                              return (v as { skuSuffix?: string })?.skuSuffix;
                            })();
                            const rate = report.rate ?? p?.nodeRates?.[milestone.templateId] ?? 0;
                            const amount = report.quantity * rate;
                            return (
                              <tr key={report.id} className="border-b border-slate-100">
                                <td className="px-4 py-3 text-slate-800">{variantSuffix || '—'}</td>
                                <td className="px-4 py-3 font-bold text-emerald-600 text-right">
                                  {report.quantity} {detailUnit}
                                </td>
                                <td className="px-4 py-3 font-bold text-amber-600 text-right">
                                  {(report.defectiveQuantity ?? 0) > 0 ? `${report.defectiveQuantity} ${detailUnit}` : '—'}
                                </td>
                                <td className="px-4 py-3 text-slate-600 text-right">
                                  {rate > 0 ? `${rate.toFixed(2)} 元/${detailUnit}` : '—'}
                                </td>
                                <td className="px-4 py-3 font-bold text-indigo-600 text-right">
                                  {amount > 0 ? amount.toFixed(2) : '—'}
                                </td>
                              </tr>
                            );
                          })
                        : reportDetailBatch.rows.map(({ progress, report }) => {
                            const p = products.find(px => px.id === progress.productId);
                            const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                            const variantSuffix = progress.variantId && (() => {
                              const v = p?.variants?.find((x: { id: string }) => x.id === progress.variantId);
                              return (v as { skuSuffix?: string })?.skuSuffix;
                            })();
                            const rate = report.rate ?? p?.nodeRates?.[progress.milestoneTemplateId] ?? 0;
                            const amount = report.quantity * rate;
                            return (
                              <tr key={report.id} className="border-b border-slate-100">
                                <td className="px-4 py-3 text-slate-800">{variantSuffix || '—'}</td>
                                <td className="px-4 py-3 font-bold text-emerald-600 text-right">
                                  {report.quantity} {detailUnit}
                                </td>
                                <td className="px-4 py-3 font-bold text-amber-600 text-right">
                                  {(report.defectiveQuantity ?? 0) > 0 ? `${report.defectiveQuantity} ${detailUnit}` : '—'}
                                </td>
                                <td className="px-4 py-3 text-slate-600 text-right">
                                  {rate > 0 ? `${rate.toFixed(2)} 元/${detailUnit}` : '—'}
                                </td>
                                <td className="px-4 py-3 font-bold text-indigo-600 text-right">
                                  {amount > 0 ? amount.toFixed(2) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                    </tbody>
                    {(() => {
                      const productId = reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.productId : reportDetailBatch.productId;
                      const p = products.find(px => px.id === productId);
                      const cat = categoryMap.get(p?.categoryId);
                      const hasColorSize = Boolean(p?.colorIds?.length && p?.sizeIds?.length) || Boolean(cat?.hasColorSize);
                      const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                      if (!hasColorSize) return null;
                      return (
                        <tfoot>
                          <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                            <td className="px-4 py-3">合计</td>
                            <td className="px-4 py-3 text-emerald-600 text-right">
                              {reportDetailBatch.totalGood} {detailUnit}
                            </td>
                            <td className="px-4 py-3 text-amber-600 text-right">
                              {reportDetailBatch.totalDefective > 0 ? `${reportDetailBatch.totalDefective} ${detailUnit}` : '—'}
                            </td>
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3 text-indigo-600 text-right">
                              {reportDetailBatch.totalAmount.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      );
                    })()}
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReportBatchDetailModal);
