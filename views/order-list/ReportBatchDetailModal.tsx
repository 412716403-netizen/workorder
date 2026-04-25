
import React, { useState, useMemo, useCallback } from 'react';
import { X, Trash2, Check, Pencil, UserPlus } from 'lucide-react';
import {
  ProductionOrder,
  Product,
  ProductCategory,
  ProductVariant,
  GlobalNodeTemplate,
  AppDictionaries,
  Worker,
  ProductMilestoneProgress,
  ProductionOpRecord,
  ProcessSequenceMode,
  OrderFormSettings,
  PrintTemplate,
  PrintRenderContext,
} from '../../types';
import WorkerSelector from '../../components/WorkerSelector';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import { useConfirm } from '../../contexts/ConfirmContext';
import { toast } from 'sonner';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import QtyMatrixTable, { type QtyMatrixTableRow } from '../../components/variant-matrix/QtyMatrixTable';
import { getEffectiveReportTemplate, getReportCustomDataDisplayEntries, mergeCustomDataForTemplate } from '../../utils/effectiveReportTemplate';
import ReportCustomFieldsEditor from '../../components/ReportCustomFieldsEditor';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { fmtDT } from '../../utils/formatTime';

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

/** 单工单在某工序的「当前还可报」上限（与工单列表口径一致）。批次含多工单时需按行汇总，勿只用 first 工单。 */
function orderEffectiveRemainingAtTemplate(
  order: ProductionOrder,
  templateId: string,
  processSequenceMode: ProcessSequenceMode,
  getDefectiveRework: (orderId: string, tid: string) => { defective: number; rework: number },
  prodRecords: ProductionOpRecord[],
): number {
  const orderTotal = order.items.reduce((s, i) => s + i.quantity, 0);
  const ms = order.milestones.find(m => m.templateId === templateId);
  if (!ms) return 0;
  const totalBase =
    processSequenceMode === 'sequential'
      ? (() => {
          const idx = order.milestones.findIndex(m => m.templateId === templateId);
          if (idx <= 0) return orderTotal;
          const prev = order.milestones[idx - 1];
          return prev?.completedQuantity ?? 0;
        })()
      : orderTotal;
  const { defective: drDef, rework: drRework } = getDefectiveRework(order.id, templateId);
  const outsourcedPending = prodRecords
    .filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === order.id && r.nodeId === templateId)
    .reduce((s, r) => s + (r.quantity ?? 0), 0);
  return Math.max(0, totalBase - drDef + drRework - (ms.completedQuantity ?? 0) - outsourcedPending);
}

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
  customData?: Record<string, any>;
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
  orderFormSettings?: OrderFormSettings;
  printTemplates?: PrintTemplate[];
  onOpenOrderFormPrintTab?: () => void;
  onUpdateReport?: (params: ReportUpdateParams) => void;
  onDeleteReport?: (params: { orderId: string; milestoneId: string; reportId: string }) => void;
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, any> }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
  onUpdateProduct?: (product: Product) => Promise<Product | null>;
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
  orderFormSettings,
  printTemplates = [],
  onOpenOrderFormPrintTab,
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

  /** 批次内每条记录对应唯一规格时，报工明细可用颜色×尺码矩阵展示（与报工弹窗一致） */
  const batchDetailMatrix = useMemo(() => {
    const b = reportDetailBatch;
    const productId = b.source === 'order' ? b.first.order.productId : b.productId;
    const p = products.find(px => px.id === productId);
    if (!p?.variants?.length) return null;
    const cat = p.categoryId ? categoryMap.get(p.categoryId) : undefined;
    if (!productHasColorSizeMatrix(p, cat)) return null;

    const variantToReportId = new Map<string, string>();
    const goodByVariant: Record<string, number> = {};
    const defectiveByVariant: Record<string, number> = {};

    if (b.source === 'order') {
      for (const { report } of b.rows as OrderReportRow[]) {
        if (!report.variantId) return null;
        if (variantToReportId.has(report.variantId)) return null;
        variantToReportId.set(report.variantId, report.id);
        goodByVariant[report.variantId] = report.quantity;
        defectiveByVariant[report.variantId] = report.defectiveQuantity ?? 0;
      }
    } else {
      for (const { progress, report } of b.rows as ProductReportRow[]) {
        if (!progress.variantId) return null;
        if (variantToReportId.has(progress.variantId)) return null;
        variantToReportId.set(progress.variantId, report.id);
        goodByVariant[progress.variantId] = report.quantity;
        defectiveByVariant[progress.variantId] = report.defectiveQuantity ?? 0;
      }
    }

    const layout = buildVariantQtyMatrixLayout(p, dictionaries);
    if (!layout) return null;
    return {
      product: p,
      layout,
      variantToReportId,
      goodByVariant,
      defectiveByVariant,
    };
  }, [reportDetailBatch, products, categoryMap, dictionaries]);

  const defectiveAndReworkByOrderMilestone = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, prodRecords),
    [orders, prodRecords]
  );
  const getDefectiveRework = (orderId: string, templateId: string) =>
    defectiveAndReworkByOrderMilestone.get(`${orderId}|${templateId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };

  /** 列表里可能筛掉部分工单；批次行里内嵌的 order 仍应用来计算可报上限 */
  const resolveOrderById = useCallback(
    (orderId: string): ProductionOrder | undefined =>
      orders.find(o => o.id === orderId) ??
      (reportDetailBatch.source === 'order'
        ? (reportDetailBatch.rows as OrderReportRow[]).find(r => r.order.id === orderId)?.order
        : undefined),
    [orders, reportDetailBatch],
  );

  const variantLabelForPrint = useCallback(
    (productId: string, variantId?: string) => {
      const p = productMap.get(productId);
      if (!variantId || !p?.variants) return '—';
      const v = p.variants.find((x: { id: string }) => x.id === variantId);
      if (!v) return variantId;
      const color = (dictionaries.colors as { id: string; name: string }[] | undefined)?.find(c => c.id === v.colorId);
      const size = (dictionaries.sizes as { id: string; name: string }[] | undefined)?.find(s => s.id === v.sizeId);
      const parts: string[] = [];
      if (color) parts.push(color.name);
      if (size) parts.push(size.name);
      return parts.length > 0 ? parts.join(' / ') : ((v as { skuSuffix?: string })?.skuSuffix || variantId);
    },
    [productMap, dictionaries.colors, dictionaries.sizes],
  );

  const buildReportBatchPrintContext = useCallback(
    (_template: PrintTemplate): PrintRenderContext => {
      const b = reportDetailBatch;
      const first = b.first;
      const fr = first.report;
      let milestoneName = '';
      let productName = '';
      let orderForCtx: ProductionOrder | undefined;
      if (b.source === 'order') {
        const fo = first as OrderReportRow;
        milestoneName = fo.milestone.name;
        productName = fo.order.productName;
        orderForCtx = fo.order;
      } else {
        milestoneName = b.milestoneName;
        productName = b.productName;
        orderForCtx = undefined;
      }
      const productId = b.source === 'order' ? (first as OrderReportRow).order.productId : b.productId;
      const productEntity = productMap.get(productId);
      const reportBatchPrint: Record<string, string | number | undefined> = {
        reportNo: (b.reportNo ?? fr.reportNo ?? '') as string,
        sourceLabel: b.source === 'order' ? '工单' : '产品',
        milestoneName,
        productName,
        totalGood: b.totalGood,
        totalDefective: b.totalDefective,
        totalAmount: b.totalAmount,
        firstOperator: fr.operator,
        firstTimestamp: fmtDT(fr.timestamp),
      };
      const printListRows = b.rows.map((row, idx) => {
        if (b.source === 'order') {
          const r = row as OrderReportRow;
          return {
            index: idx + 1,
            quantity: r.report.quantity,
            defectiveQuantity: r.report.defectiveQuantity ?? 0,
            operator: r.report.operator,
            timestamp: fmtDT(r.report.timestamp),
            variantLabel: variantLabelForPrint(r.order.productId, r.report.variantId),
            orderNumber: r.order.orderNumber,
            milestoneName: r.milestone.name,
          };
        }
        const r = row as ProductReportRow;
        return {
          index: idx + 1,
          quantity: r.report.quantity,
          defectiveQuantity: r.report.defectiveQuantity ?? 0,
          operator: r.report.operator,
          timestamp: fmtDT(r.report.timestamp),
          variantLabel: variantLabelForPrint(r.progress.productId, r.report.variantId),
          orderNumber: '—',
          milestoneName: b.milestoneName,
        };
      });
      return {
        order: orderForCtx,
        product: productEntity ?? undefined,
        milestoneName,
        completedQuantity: b.totalGood,
        reportBatchPrint,
        printListRows,
      };
    },
    [reportDetailBatch, productMap, variantLabelForPrint],
  );

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
      customData: Record<string, any>;
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
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
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
                    const customDataPayload = f.customData;
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
                          newMilestoneId: changedMilestone ? editingReport.milestoneId : undefined,
                          customData: customDataPayload,
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
                          newMilestoneTemplateId: changedTemplate ? editingReport.templateId : undefined,
                          customData: customDataPayload,
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
                <OrderCenterDetailPrintBlock
                  printSlot={orderFormSettings?.orderCenterPrint?.reportBatchDetail}
                  printTemplates={printTemplates}
                  buildContext={buildReportBatchPrintContext}
                  onAddPrintTemplate={onOpenOrderFormPrintTab}
                  pickerSubtitle={
                    reportDetailBatch.reportNo
                      ? `报工批次 ${reportDetailBatch.reportNo}`
                      : reportDetailBatch.source === 'order'
                        ? `工单 ${(reportDetailBatch.first as OrderReportRow).order.orderNumber}`
                        : reportDetailBatch.productName
                  }
                />
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
                      const msFull = order.milestones?.find(m => m.templateId === milestone.templateId);
                      const customData = mergeCustomDataForTemplate(
                        report.customData,
                        milestone.templateId,
                        msFull?.reportTemplate,
                        product?.routeReportValues?.[milestone.templateId],
                        globalNodes,
                      );
                      if (reportDetailBatch.rows.length > 1) {
                        const first = JSON.stringify(report.customData ?? {});
                        const hasDiff = reportDetailBatch.rows.some(r => JSON.stringify(r.report.customData ?? {}) !== first);
                        if (hasDiff) toast.warning('批次内各行的填报项数据不一致，编辑后将统一为同一份填报项');
                      }
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
                          customData,
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
                      const customData = mergeCustomDataForTemplate(
                        report.customData,
                        progress.milestoneTemplateId,
                        undefined,
                        product?.routeReportValues?.[progress.milestoneTemplateId],
                        globalNodes,
                      );
                      if (reportDetailBatch.rows.length > 1) {
                        const first = JSON.stringify(report.customData ?? {});
                        const hasDiff = reportDetailBatch.rows.some(r => JSON.stringify(r.report.customData ?? {}) !== first);
                        if (hasDiff) toast.warning('批次内各行的填报项数据不一致，编辑后将统一为同一份填报项');
                      }
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
                          customData,
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
        <div className="flex-1 overflow-auto p-4 sm:p-5 space-y-4">
          {reportDetailBatch.source === 'order' ? (
            <div className="space-y-0.5">
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
                工单 <span className="font-bold text-slate-600 tabular-nums">{reportDetailBatch.first.order.orderNumber}</span>
              </p>
            </div>
          ) : null}
          {editingReport ? (() => {
            const order = reportDetailBatch.source === 'order' ? orders.find(o => o.id === editingReport.orderId) : null;
            const milestone = order?.milestones.find(m => m.templateId === editingReport.templateId);
            const tid = editingReport.templateId;
            const effectiveRemainingSaved =
              reportDetailBatch.source === 'order'
                ? [...new Set(reportDetailBatch.rows.map(r => r.order.id))].reduce((sum, oid) => {
                    const o = resolveOrderById(oid);
                    if (!o) return sum;
                    return sum + orderEffectiveRemainingAtTemplate(o, tid, processSequenceMode, getDefectiveRework, prodRecords);
                  }, 0)
                : Math.max(
                    0,
                    (() => {
                      const orderTotal = order ? order.items.reduce((s, i) => s + i.quantity, 0) : 0;
                      const totalBase =
                        order && milestone && processSequenceMode === 'sequential'
                          ? (() => {
                              const idx = order.milestones.findIndex(m => m.templateId === tid);
                              if (idx <= 0) return orderTotal;
                              const prev = order.milestones[idx - 1];
                              return prev?.completedQuantity ?? 0;
                            })()
                          : orderTotal || 0;
                      const { defective: totalDefective, rework: totalRework } = order
                        ? getDefectiveRework(order.id, tid)
                        : { defective: 0, rework: 0 };
                      const totalCompleted = milestone?.completedQuantity ?? 0;
                      const outsourcedPendingEdit = order
                        ? prodRecords
                            .filter(
                              r =>
                                r.type === 'OUTSOURCE' &&
                                r.status === '加工中' &&
                                r.orderId === order.id &&
                                r.nodeId === tid,
                            )
                            .reduce((s, r) => s + (r.quantity ?? 0), 0)
                        : 0;
                      return totalBase - totalDefective + totalRework - totalCompleted - outsourcedPendingEdit;
                    })(),
                  );
            const batchDefectiveSum = editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
            const rowGoodSum = editingReport.form.rowEdits.reduce((s, r) => s + r.quantity, 0);
            const maxBatchGoodBase =
              effectiveRemainingSaved + reportDetailBatch.totalGood + reportDetailBatch.totalDefective - batchDefectiveSum;
            const maxBatchGood =
              reportDetailBatch.source === 'order'
                ? Math.max(0, maxBatchGoodBase, reportDetailBatch.totalGood, rowGoodSum)
                : Math.max(0, maxBatchGoodBase);
            return (
            <>
              {reportDetailBatch.source === 'order' && order && (
                <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2">
                  本工序可报最多 <span className="font-bold text-indigo-600">{effectiveRemainingSaved}</span> 件（已扣不良、加返工）；当前批良品合计不超过 <span className="font-bold text-indigo-600">{Math.max(0, maxBatchGood)}</span> 件
                </div>
              )}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工信息</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">工序</label>
                    <select
                      value={editingReport.templateId}
                    onChange={e => {
                      const newTemplateId = e.target.value;
                      const product = productMap.get(editingReport.productId);
                      const newRate = product?.nodeRates?.[newTemplateId] ?? 0;
                      if (reportDetailBatch.source === 'order') {
                        const order = orders.find(o => o.id === editingReport.orderId);
                        const newMilestone = order?.milestones.find(m => m.templateId === newTemplateId);
                        const newCd = mergeCustomDataForTemplate(
                          editingReport.form.customData,
                          newTemplateId,
                          newMilestone?.reportTemplate,
                          product?.routeReportValues?.[newTemplateId],
                          globalNodes,
                        );
                        setEditingReport(prev => prev ? {
                          ...prev,
                          templateId: newTemplateId,
                          milestoneId: newMilestone?.id || prev.milestoneId,
                          form: { ...prev.form, rate: newRate, customData: newCd }
                        } : prev);
                      } else {
                        const newCd = mergeCustomDataForTemplate(
                          editingReport.form.customData,
                          newTemplateId,
                          undefined,
                          product?.routeReportValues?.[newTemplateId],
                          globalNodes,
                        );
                        setEditingReport(prev => prev ? {
                          ...prev,
                          templateId: newTemplateId,
                          form: { ...prev.form, rate: newRate, customData: newCd }
                        } : prev);
                      }
                    }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      {globalNodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">报工时间</label>
                    <input
                      type="datetime-local"
                      value={editingReport.form.timestamp}
                      onChange={e => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">操作人</label>
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
                      variant="default"
                      icon={UserPlus}
                    />
                  </div>
                </div>
              </div>
              {(() => {
                const editTmpl = getEffectiveReportTemplate(
                  milestone ?? { templateId: editingReport.templateId, reportTemplate: [] },
                  globalNodes,
                );
                if (editTmpl.length === 0) return null;
                const cd = editingReport.form.customData;
                return (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">填报项 / 备注</p>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 space-y-3">
                      <ReportCustomFieldsEditor
                        fields={editTmpl}
                        values={cd}
                        onChange={(fieldId, value) => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, customData: { ...prev.form.customData, [fieldId]: value } } } : prev)}
                        namePrefix="stp-batch-edit"
                        inputClassName="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none"
                        fileHint="已选择文件，保存后生效"
                      />
                    </div>
                  </div>
                );
              })()}
              {batchDetailMatrix ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细（按规格）</p>
                  <div className="rounded-xl bg-slate-50/50 p-2 ring-1 ring-slate-100/80">
                    {(() => {
                      const { layout, variantToReportId } = batchDetailMatrix;
                      const isOrderBatch = reportDetailBatch.source === 'order';
                      const rows: QtyMatrixTableRow[] = layout.colorRows.map(row => {
                        let rowSum = 0;
                        const cells = row.variantAtSize.map((variant: ProductVariant | null, si: number) => {
                          if (!variant) {
                            return <span key={`${row.key}-e-${si}`} className="text-sm text-slate-300">—</span>;
                          }
                          const reportId = variantToReportId.get(variant.id);
                          const rowEdit = reportId
                            ? editingReport.form.rowEdits.find(r => r.reportId === reportId)
                            : undefined;
                          if (!reportId || !rowEdit) {
                            return <span key={variant.id} className="text-sm text-slate-300">—</span>;
                          }
                          rowSum += rowEdit.quantity;
                          const otherGoodSum = editingReport.form.rowEdits
                            .filter(r => r.reportId !== reportId)
                            .reduce((s, r) => s + r.quantity, 0);
                          const maxThisRow = isOrderBatch ? Math.max(0, maxBatchGood - otherGoodSum) : Number.POSITIVE_INFINITY;
                          return (
                            <div key={variant.id} className="flex min-w-0 flex-col gap-0.5">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  max={isOrderBatch && maxBatchGood >= 0 ? maxThisRow : undefined}
                                  title={isOrderBatch && maxBatchGood >= 0 ? `本批良品合计最多 ${maxBatchGood} 件` : undefined}
                                  value={rowEdit.quantity}
                                  onChange={e => {
                                    const raw = parseInt(e.target.value, 10) || 0;
                                    const v =
                                      isOrderBatch && maxBatchGood >= 0 ? Math.min(raw, maxThisRow) : raw;
                                    setEditingReport(prev =>
                                      prev
                                        ? {
                                            ...prev,
                                            form: {
                                              ...prev.form,
                                              rowEdits: prev.form.rowEdits.map(r =>
                                                r.reportId === reportId ? { ...r, quantity: v } : r,
                                              ),
                                            },
                                          }
                                        : prev,
                                    );
                                  }}
                                  className="h-8 w-[3rem] shrink-0 rounded-md border border-slate-200 bg-white px-1.5 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                                {isOrderBatch && maxBatchGood >= 0 ? (
                                  <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-slate-400">
                                    最多 {maxThisRow}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex min-w-0 items-center gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  tabIndex={-1}
                                  value={rowEdit.defectiveQuantity}
                                  onChange={e => {
                                    const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    setEditingReport(prev => {
                                      if (!prev) return prev;
                                      const nextEdits = prev.form.rowEdits.map(r =>
                                        r.reportId === reportId ? { ...r, defectiveQuantity: v } : r,
                                      );
                                      if (!isOrderBatch) {
                                        return { ...prev, form: { ...prev.form, rowEdits: nextEdits } };
                                      }
                                      const newDefSum = nextEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
                                      const newGoodSum = nextEdits.reduce((s, r) => s + r.quantity, 0);
                                      const newMaxBase =
                                        effectiveRemainingSaved +
                                        reportDetailBatch.totalGood +
                                        reportDetailBatch.totalDefective -
                                        newDefSum;
                                      const newMaxBatchGood =
                                        reportDetailBatch.source === 'order'
                                          ? Math.max(0, newMaxBase, reportDetailBatch.totalGood, newGoodSum)
                                          : Math.max(0, newMaxBase);
                                      const totalQty = nextEdits.reduce((s, r) => s + r.quantity, 0);
                                      if (totalQty > newMaxBatchGood && newMaxBatchGood >= 0) {
                                        const scale = totalQty > 0 ? newMaxBatchGood / totalQty : 0;
                                        const clamped = nextEdits.map(r => ({
                                          ...r,
                                          quantity: Math.floor(r.quantity * scale),
                                        }));
                                        const remainder =
                                          newMaxBatchGood - clamped.reduce((s, r) => s + r.quantity, 0);
                                        const final =
                                          clamped.length > 0 && remainder > 0
                                            ? clamped.map((r, i) =>
                                                i === 0 ? { ...r, quantity: r.quantity + remainder } : r,
                                              )
                                            : clamped;
                                        return { ...prev, form: { ...prev.form, rowEdits: final } };
                                      }
                                      return { ...prev, form: { ...prev.form, rowEdits: nextEdits } };
                                    });
                                  }}
                                  className="h-8 w-[3rem] shrink-0 rounded-md border border-amber-200/90 bg-amber-50/90 px-1.5 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-[9px] placeholder:text-amber-400/80"
                                  placeholder="0"
                                  title="不良品"
                                />
                                <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-amber-800">不良品</span>
                              </div>
                            </div>
                          );
                        });
                        return {
                          key: row.key,
                          colorCell: (
                            <div className="flex items-center gap-2">
                              {row.colorSwatch ? (
                                <span
                                  className="h-4 w-4 shrink-0 rounded-full border border-slate-200"
                                  style={{ backgroundColor: row.colorSwatch }}
                                />
                              ) : null}
                              <span>{row.colorLabel}</span>
                            </div>
                          ),
                          cells,
                          subtotalCell: rowSum,
                        };
                      });
                      return (
                        <QtyMatrixTable
                          sizeHeaders={layout.sizeColumns.map(c => c.header)}
                          rows={rows}
                          dense
                        />
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-indigo-50/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-600">工价</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={editingReport.form.rate}
                        onChange={e =>
                          setEditingReport(prev =>
                            prev ? { ...prev, form: { ...prev.form, rate: parseFloat(e.target.value) || 0 } } : prev,
                          )
                        }
                        className="h-8 w-[5.25rem] rounded-lg border border-slate-200 bg-white px-1.5 text-xs font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                      <span className="text-slate-500">
                        元/
                        {(batchDetailMatrix.product.unitId &&
                          dictionaries.units.find(u => u.id === batchDetailMatrix.product.unitId)?.name) ||
                          '件'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-indigo-700 tabular-nums">
                      合计 良品 {editingReport.form.rowEdits.reduce((s, r) => s + r.quantity, 0)}{' '}
                      {(batchDetailMatrix.product.unitId &&
                        dictionaries.units.find(u => u.id === batchDetailMatrix.product.unitId)?.name) ||
                        '件'}
                      {' · '}
                      不良{' '}
                      {editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0)}{' '}
                      {(batchDetailMatrix.product.unitId &&
                        dictionaries.units.find(u => u.id === batchDetailMatrix.product.unitId)?.name) ||
                        '件'}
                      {' · '}
                      金额 {editingReport.form.rowEdits.reduce((s, r) => s + r.quantity * editingReport.form.rate, 0).toFixed(2)} 元
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细</p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-2 sm:p-3 space-y-2">
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">产品</th>
                      <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-left">数量</th>
                      <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">工价</th>
                      <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">金额(元)</th>
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
                          const rate = editingReport.form.rate;
                          const amount = rowEdit.quantity * rate;
                          return (
                            <tr key={report.id} className="border-b border-slate-100">
                              <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[11rem] sm:max-w-[14rem]">
                                <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={order.productName}>
                                  {order.productName}
                                </span>
                                <span className="mt-0.5 block text-[10px] sm:text-[11px] font-medium text-slate-500 truncate" title={order.orderNumber}>
                                  {order.orderNumber}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 sm:px-4 align-middle">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <div className="flex min-w-0 items-center gap-1.5">
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
                                      className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                                    />
                                    {maxBatchGood >= 0 ? (
                                      <span className="text-[10px] font-medium tabular-nums text-slate-400">最多 {maxThisRow}</span>
                                    ) : null}
                                  </div>
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={0}
                                      tabIndex={-1}
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
                                      className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-amber-200/90 bg-amber-50/90 px-2 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 tabular-nums"
                                      placeholder="0"
                                      title="不良品"
                                    />
                                    <span className="text-[10px] font-medium tabular-nums text-amber-800">不良品</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 sm:px-4 align-middle text-right">
                                <span className="text-slate-600 text-xs">{editingReport.form.rate > 0 ? `${editingReport.form.rate.toFixed(2)} 元/${detailUnit}` : '—'}</span>
                              </td>
                              <td className="px-3 py-2.5 sm:px-4 align-middle text-sm font-bold text-indigo-600 text-right tabular-nums">{amount >= 0 ? amount.toFixed(2) : '—'}</td>
                            </tr>
                          );
                        })
                      : reportDetailBatch.rows.map(({ progress, report }) => {
                          const rowEdit = editingReport.form.rowEdits.find(r => r.reportId === report.id);
                          if (!rowEdit) return null;
                          const p = products.find(px => px.id === progress.productId);
                          const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                          const rate = editingReport.form.rate;
                          const amount = rowEdit.quantity * rate;
                          return (
                            <tr key={report.id} className="border-b border-slate-100">
                              <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[11rem] sm:max-w-[14rem]">
                                <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={reportDetailBatch.productName}>
                                  {reportDetailBatch.productName}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 sm:px-4 align-middle">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <div className="flex min-w-0 items-center gap-1.5">
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
                                      className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                                    />
                                  </div>
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={0}
                                      tabIndex={-1}
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
                                      className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-amber-200/90 bg-amber-50/90 px-2 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 tabular-nums"
                                      placeholder="0"
                                      title="不良品"
                                    />
                                    <span className="text-[10px] font-medium tabular-nums text-amber-800">不良品</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 sm:px-4 align-middle text-right">
                                <span className="text-slate-600 text-xs">{editingReport.form.rate > 0 ? `${editingReport.form.rate.toFixed(2)} 元/${detailUnit}` : '—'}</span>
                              </td>
                              <td className="px-3 py-2.5 sm:px-4 align-middle text-sm font-bold text-indigo-600 text-right tabular-nums">{amount >= 0 ? amount.toFixed(2) : '—'}</td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
                    </div>
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-indigo-50/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-slate-600">工价</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editingReport.form.rate}
                          onChange={e =>
                            setEditingReport(prev =>
                              prev ? { ...prev, form: { ...prev.form, rate: parseFloat(e.target.value) || 0 } } : prev,
                            )
                          }
                          className="h-8 w-[5.25rem] rounded-lg border border-slate-200 bg-white px-1.5 text-xs font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <span className="text-slate-500">
                          元/
                          {(products.find(px => px.id === editingReport.productId)?.unitId &&
                            dictionaries.units.find(u => u.id === products.find(px => px.id === editingReport.productId)?.unitId)?.name) ||
                            '件'}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-indigo-700 tabular-nums">
                        合计 良品 {editingReport.form.rowEdits.reduce((s, r) => s + r.quantity, 0)}{' '}
                        {(products.find(px => px.id === editingReport.productId)?.unitId &&
                          dictionaries.units.find(u => u.id === products.find(px => px.id === editingReport.productId)?.unitId)?.name) ||
                          '件'}
                        {' · '}不良{' '}
                        {editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0)}{' '}
                        {(products.find(px => px.id === editingReport.productId)?.unitId &&
                          dictionaries.units.find(u => u.id === products.find(px => px.id === editingReport.productId)?.unitId)?.name) ||
                          '件'}
                        {' · '}金额 {editingReport.form.rowEdits.reduce((s, r) => s + r.quantity * editingReport.form.rate, 0).toFixed(2)} 元
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
          })() : (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 sm:px-4">
                {(() => {
                  const productId = reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.productId : reportDetailBatch.productId;
                  const p = products.find(px => px.id === productId);
                  const unitName = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                  const milestoneName = reportDetailBatch.source === 'order'
                    ? reportDetailBatch.first.milestone.name
                    : reportDetailBatch.milestoneName;
                  const tid = reportDetailBatch.source === 'order' ? reportDetailBatch.first.milestone.templateId : reportDetailBatch.milestoneTemplateId;
                  const effectiveRemainingView =
                    reportDetailBatch.source === 'order'
                      ? [...new Set(reportDetailBatch.rows.map(r => r.order.id))].reduce((sum, oid) => {
                          const o = resolveOrderById(oid);
                          if (!o) return sum;
                          return sum + orderEffectiveRemainingAtTemplate(o, tid, processSequenceMode, getDefectiveRework, prodRecords);
                        }, 0)
                      : null;
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">工序</p>
                        <p className="text-xs sm:text-sm font-bold text-slate-800">{milestoneName || '—'}</p>
                      </div>
                      {reportDetailBatch.source === 'order' && (
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">
                            本工序还可报（批次涉及工单合计）
                          </p>
                          <p className="text-xs sm:text-sm font-bold text-indigo-600 tabular-nums">
                            {effectiveRemainingView ?? 0} {unitName}
                            <span className="block text-[10px] font-normal text-slate-400 mt-0.5">已扣不良、返工、外协在制</span>
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">本次报工量</p>
                        <p className="text-xs sm:text-sm font-bold text-indigo-600 tabular-nums">{reportDetailBatch.totalGood} {unitName}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">报工时间</p>
                        <p className="text-xs sm:text-sm font-bold text-slate-800">{fmtDT(reportDetailBatch.first.report.timestamp)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">操作人</p>
                        <p className="text-xs sm:text-sm font-bold text-slate-800">{reportDetailBatch.first.report.operator}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {(() => {
                const tid =
                  reportDetailBatch.source === 'order'
                    ? reportDetailBatch.first.milestone.templateId
                    : reportDetailBatch.milestoneTemplateId;
                const ms =
                  reportDetailBatch.source === 'order'
                    ? reportDetailBatch.first.order.milestones?.find(m => m.templateId === tid)
                    : undefined;
                const tmpl = getEffectiveReportTemplate(ms ?? { templateId: tid, reportTemplate: [] }, globalNodes);
                const cd = reportDetailBatch.first.report?.customData;
                const entries = getReportCustomDataDisplayEntries(cd, tmpl);
                if (entries.length === 0) return null;
                return (
                  <div className="space-y-2 shrink-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工填报项</p>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 space-y-1.5">
                      {entries.map(e => (
                        <p key={e.fieldId} className="text-xs leading-relaxed">
                          <span className="font-bold text-slate-600">{e.label}：</span>
                          <span className="text-slate-800 break-all">{e.display}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="flex-1 overflow-auto pb-4 -mt-1">
                {batchDetailMatrix ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细（按规格）</p>
                    <div className="rounded-xl bg-slate-50/50 p-2 ring-1 ring-slate-100/80">
                      {(() => {
                        const { layout, goodByVariant, defectiveByVariant, variantToReportId } = batchDetailMatrix;
                        const rows: QtyMatrixTableRow[] = layout.colorRows.map(row => {
                          let rowSum = 0;
                          const cells = row.variantAtSize.map((variant: ProductVariant | null, si: number) => {
                            if (!variant) {
                              return <span key={`${row.key}-e-${si}`} className="text-sm text-slate-300">—</span>;
                            }
                            if (!variantToReportId.has(variant.id)) {
                              return <span key={variant.id} className="text-sm text-slate-300">—</span>;
                            }
                            const g = goodByVariant[variant.id] ?? 0;
                            const d = defectiveByVariant[variant.id] ?? 0;
                            rowSum += g;
                            return (
                              <div key={variant.id} className="flex min-w-0 flex-col gap-1">
                                <span className="text-sm font-bold text-emerald-600 tabular-nums">{g}</span>
                                {d > 0 ? (
                                  <span className="text-[10px] font-medium tabular-nums text-amber-700">不良 {d}</span>
                                ) : null}
                              </div>
                            );
                          });
                          return {
                            key: row.key,
                            colorCell: (
                              <div className="flex items-center gap-2">
                                {row.colorSwatch ? (
                                  <span
                                    className="h-4 w-4 shrink-0 rounded-full border border-slate-200"
                                    style={{ backgroundColor: row.colorSwatch }}
                                  />
                                ) : null}
                                <span>{row.colorLabel}</span>
                              </div>
                            ),
                            cells,
                            subtotalCell: rowSum,
                          };
                        });
                        return (
                          <QtyMatrixTable
                            sizeHeaders={layout.sizeColumns.map(c => c.header)}
                            rows={rows}
                            dense
                          />
                        );
                      })()}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-indigo-50/50 px-3 py-2 text-xs font-bold text-slate-700">
                      <span className="tabular-nums">
                        {(() => {
                          const du =
                            (batchDetailMatrix.product.unitId &&
                              dictionaries.units.find(u => u.id === batchDetailMatrix.product.unitId)?.name) ||
                            '件';
                          const rate =
                            reportDetailBatch.source === 'order'
                              ? (() => {
                                  const r0 = reportDetailBatch.rows[0] as OrderReportRow;
                                  return (
                                    r0.report.rate ??
                                    batchDetailMatrix.product.nodeRates?.[r0.milestone.templateId] ??
                                    0
                                  );
                                })()
                              : (() => {
                                  const r0 = reportDetailBatch.rows[0] as ProductReportRow;
                                  return (
                                    r0.report.rate ??
                                    batchDetailMatrix.product.nodeRates?.[r0.progress.milestoneTemplateId] ??
                                    0
                                  );
                                })();
                          return rate > 0 ? `工价 ${rate.toFixed(2)} 元/${du}` : '工价 —';
                        })()}
                      </span>
                      <span className="text-indigo-700 tabular-nums">
                        合计 良品 {reportDetailBatch.totalGood} · 不良{' '}
                        {reportDetailBatch.totalDefective > 0 ? reportDetailBatch.totalDefective : '—'} · 本批金额{' '}
                        {reportDetailBatch.totalAmount.toFixed(2)} 元
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细</p>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-2 sm:p-3 space-y-2">
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">产品</th>
                          <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-left">数量</th>
                          <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">工价</th>
                          <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">金额(元)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportDetailBatch.source === 'order'
                          ? reportDetailBatch.rows.map(({ order, milestone, report }) => {
                              const p = products.find(px => px.id === order.productId);
                              const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                              const rate = report.rate ?? p?.nodeRates?.[milestone.templateId] ?? 0;
                              const amount = report.quantity * rate;
                              const def = report.defectiveQuantity ?? 0;
                              return (
                                <tr key={report.id} className="border-b border-slate-100">
                                  <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[11rem] sm:max-w-[14rem]">
                                    <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={order.productName}>
                                      {order.productName}
                                    </span>
                                    <span className="mt-0.5 block text-[10px] sm:text-[11px] font-medium text-slate-500 truncate" title={order.orderNumber}>
                                      {order.orderNumber}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 sm:px-4 align-middle">
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                      <span className="text-sm font-bold text-emerald-600 tabular-nums">
                                        {report.quantity} {detailUnit}
                                      </span>
                                      {def > 0 ? (
                                        <span className="text-[10px] font-medium tabular-nums text-amber-800">不良 {def} {detailUnit}</span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 sm:px-4 align-middle text-slate-600 text-right text-xs">
                                    {rate > 0 ? `${rate.toFixed(2)} 元/${detailUnit}` : '—'}
                                  </td>
                                  <td className="px-3 py-2.5 sm:px-4 align-middle text-sm font-bold text-indigo-600 text-right tabular-nums">
                                    {amount > 0 ? amount.toFixed(2) : '—'}
                                  </td>
                                </tr>
                              );
                            })
                          : reportDetailBatch.rows.map(({ progress, report }) => {
                              const p = products.find(px => px.id === progress.productId);
                              const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                              const rate = report.rate ?? p?.nodeRates?.[progress.milestoneTemplateId] ?? 0;
                              const amount = report.quantity * rate;
                              const def = report.defectiveQuantity ?? 0;
                              return (
                                <tr key={report.id} className="border-b border-slate-100">
                                  <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[11rem] sm:max-w-[14rem]">
                                    <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={reportDetailBatch.productName}>
                                      {reportDetailBatch.productName}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 sm:px-4 align-middle">
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                      <span className="text-sm font-bold text-emerald-600 tabular-nums">
                                        {report.quantity} {detailUnit}
                                      </span>
                                      {def > 0 ? (
                                        <span className="text-[10px] font-medium tabular-nums text-amber-800">不良 {def} {detailUnit}</span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 sm:px-4 align-middle text-slate-600 text-right text-xs">
                                    {rate > 0 ? `${rate.toFixed(2)} 元/${detailUnit}` : '—'}
                                  </td>
                                  <td className="px-3 py-2.5 sm:px-4 align-middle text-sm font-bold text-indigo-600 text-right tabular-nums">
                                    {amount > 0 ? amount.toFixed(2) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                      </tbody>
                    </table>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-indigo-50/50 px-3 py-2 text-xs font-bold text-slate-700">
                        <span className="tabular-nums">
                          {(() => {
                            const productId =
                              reportDetailBatch.source === 'order'
                                ? reportDetailBatch.first.order.productId
                                : reportDetailBatch.productId;
                            const p = products.find(px => px.id === productId);
                            const du =
                              (p?.unitId && dictionaries.units.find(u => u.id === p.unitId)?.name) || '件';
                            const rate =
                              reportDetailBatch.source === 'order'
                                ? (() => {
                                    const r0 = reportDetailBatch.rows[0] as OrderReportRow;
                                    return r0.report.rate ?? p?.nodeRates?.[r0.milestone.templateId] ?? 0;
                                  })()
                                : (() => {
                                    const r0 = reportDetailBatch.rows[0] as ProductReportRow;
                                    return r0.report.rate ?? p?.nodeRates?.[r0.progress.milestoneTemplateId] ?? 0;
                                  })();
                            return rate > 0 ? `工价 ${rate.toFixed(2)} 元/${du}` : '工价 —';
                          })()}
                        </span>
                        <span className="text-indigo-700 tabular-nums">
                          合计 良品 {reportDetailBatch.totalGood} · 不良{' '}
                          {reportDetailBatch.totalDefective > 0 ? reportDetailBatch.totalDefective : '—'} · 本批金额{' '}
                          {reportDetailBatch.totalAmount.toFixed(2)} 元
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReportBatchDetailModal);
