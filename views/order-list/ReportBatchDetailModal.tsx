
import React, { useState, useMemo, useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Check, UserPlus, Clock, User, Package } from 'lucide-react';
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
import DocPhaseModal, { DocPhaseEditToolbarPortalContext } from '../../components/DocPhaseModal';
import { DocInlineMetaRow, DocSummaryCard } from '../../components/doc-modal';
import { toast } from 'sonner';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import QtyMatrixTable, { type QtyMatrixTableRow } from '../../components/variant-matrix/QtyMatrixTable';
import { getEffectiveReportTemplate, getReportCustomDataDisplayEntries, mergeCustomDataForTemplate } from '../../utils/effectiveReportTemplate';
import ReportCustomFieldsEditor from '../../components/ReportCustomFieldsEditor';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { fmtDT } from '../../utils/formatTime';
import { buildOneBlockMatrixPrintRows } from '../../utils/variantMatrixPrintRows';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { reportBatchRowWeightForPayload } from '../../utils/reportBatchSaveWeight';

function reportNodeUsesWeight(globalNodes: GlobalNodeTemplate[], templateId: string): boolean {
  return !!globalNodes.find(n => n.id === templateId)?.enableWeightOnReport;
}

function formatReportWeightKgDisplay(w: unknown): string {
  const n = typeof w === 'number' ? w : typeof w === 'string' ? parseFloat(String(w)) : NaN;
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (Number.isInteger(n)) return String(Math.trunc(n));
  const t = n.toFixed(4).replace(/\.?0+$/, '');
  return t || '0';
}

function weightToNumberSumPart(w: unknown): number {
  const n = typeof w === 'number' ? w : typeof w === 'string' ? parseFloat(String(w)) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseWeightFieldForEdit(w: unknown): number | '' {
  const n = typeof w === 'number' ? w : typeof w === 'string' ? parseFloat(String(w)) : NaN;
  if (!Number.isFinite(n) || n < 0) return '';
  return n;
}

/** 按良品数量比例分摊批次总重到各行，最后一行吃掉舍入误差 */
function distributeReportWeightsByGoodQty(batchW: number, rows: { quantity: number }[]): number[] {
  const goodSum = rows.reduce((s, r) => s + r.quantity, 0);
  if (rows.length === 0) return [];
  if (goodSum <= 0) return rows.map(() => 0);
  let allocated = 0;
  return rows.map((row, idx) => {
    if (idx === rows.length - 1) return Math.round((batchW - allocated) * 1e6) / 1e6;
    const part = Math.round(((batchW * row.quantity) / goodSum) * 1e6) / 1e6;
    allocated += part;
    return part;
  });
}

type OrderReportRow = {
  order: ProductionOrder;
  milestone: { id: string; name: string; templateId: string };
  report: {
    id: string; timestamp: string; operator: string; quantity: number;
    defectiveQuantity?: number; variantId?: string; reportBatchId?: string; reportNo?: string;
    [k: string]: unknown;
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
  customData?: Record<string, unknown>;
  weight?: number | null;
};

/** 报工编辑行：矩阵模式下 `reportId` 为空表示该规格尚未有记录，保存时走新增 */
type BatchRowEdit = {
  reportId: string;
  variantId?: string;
  orderId: string;
  milestoneId: string;
  progressId?: string;
  quantity: number;
  defectiveQuantity: number;
  weightKg?: number | '';
};

function resolveOrderMilestoneForVariant(
  batchRows: OrderReportRow[],
  variantId: string,
  templateId: string,
): { orderId: string; milestoneId: string } {
  const withItem = batchRows.find(({ order }) => order.items.some(i => i.variantId === variantId));
  const base = withItem ?? batchRows[0]!;
  const order = base.order;
  const ms = order.milestones.find(m => m.templateId === templateId);
  return { orderId: order.id, milestoneId: ms?.id ?? base.milestone.id };
}

function ReportBatchEditSavePortal({ active, onSave }: { active: boolean; onSave: () => void }) {
  const host = useContext(DocPhaseEditToolbarPortalContext);
  if (!active || !host) return null;
  return createPortal(
    <button
      type="button"
      onClick={onSave}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
    >
      <Check className="w-4 h-4" /> 保存
    </button>,
    host,
  );
}

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
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, unknown>; weight?: number | null }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
  onUpdateProduct?: (product: Product) => Promise<Product | null>;
  /** 矩阵编辑补录新规格时用，与 {@link ReportModal} 多规格报工一致 */
  onReportSubmit?: (
    oId: string,
    mId: string,
    qty: number,
    data: Record<string, unknown> | null,
    vId?: string,
    workerId?: string,
    defectiveQty?: number,
    equipmentId?: string,
    reportBatchId?: string,
    reportNo?: string,
    weight?: number,
  ) => Promise<void>;
  onReportSubmitProduct?: (
    productId: string,
    milestoneTemplateId: string,
    qty: number,
    data: Record<string, unknown> | null,
    vId?: string,
    workerId?: string,
    defectiveQty?: number,
    equipmentId?: string,
    reportBatchId?: string,
    reportNo?: string,
    weight?: number,
  ) => Promise<void>;
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
  onReportSubmit,
  onReportSubmitProduct,
  hasOrderPerm,
}) => {
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

  const reportDetailViewTemplateId =
    reportDetailBatch.source === 'order'
      ? reportDetailBatch.first.milestone.templateId
      : reportDetailBatch.milestoneTemplateId;
  const reportDetailViewNodeUsesWeight = useMemo(
    () => reportNodeUsesWeight(globalNodes, reportDetailViewTemplateId),
    [globalNodes, reportDetailViewTemplateId],
  );
  const reportDetailBatchTotalWeightKg = useMemo(() => {
    if (reportDetailBatch.source === 'order') {
      return (reportDetailBatch.rows as OrderReportRow[]).reduce((s, { report }) => s + weightToNumberSumPart(report.weight), 0);
    }
    return (reportDetailBatch.rows as ProductReportRow[]).reduce((s, { report }) => s + weightToNumberSumPart(report.weight), 0);
  }, [reportDetailBatch]);

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
      const qtyRows = b.rows.map(row =>
        b.source === 'order'
          ? {
              variantId: (row as OrderReportRow).report.variantId,
              quantity: (row as OrderReportRow).report.quantity,
            }
          : {
              variantId: (row as ProductReportRow).report.variantId,
              quantity: (row as ProductReportRow).report.quantity,
            },
      );
      const defectiveSum = b.rows.reduce((s, row) => {
        const dq =
          b.source === 'order'
            ? (row as OrderReportRow).report.defectiveQuantity
            : (row as ProductReportRow).report.defectiveQuantity;
        return s + (Number(dq) || 0);
      }, 0);
      const printListRows = buildOneBlockMatrixPrintRows({
        productId,
        product: productEntity,
        products,
        dictionaries,
        rows: qtyRows,
        extra: {
          defectiveQuantity: defectiveSum,
          operator: fr.operator,
          timestamp: fmtDT(fr.timestamp),
          orderNumber: b.source === 'order' ? (first as OrderReportRow).order.orderNumber : '—',
          milestoneName,
        },
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
    [reportDetailBatch, productMap, products, dictionaries],
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
      customData: Record<string, unknown>;
      /** 有规格矩阵且工序开启称重时：本批总重 (kg)，保存时按各规格良品数量比例分摊到各 report */
      weightKg?: number | '';
      rowEdits: BatchRowEdit[];
    };
  } | null>(null);

  const handleClose = () => {
    setEditingReport(null);
    onClose();
  };

  const handleSave = async () => {
    if (!editingReport) return;
    const f = editingReport.form;
    const ts = new Date(f.timestamp);
    const tsStr = isNaN(ts.getTime()) ? new Date().toLocaleString() : ts.toLocaleString();
    const customDataPayload = f.customData;
    const matrixMode = !!batchDetailMatrix;
    if (reportDetailBatch.source === 'order' && onUpdateReport) {
      const origMilestoneId = reportDetailBatch.first.milestone.id;
      const changedMilestone = editingReport.milestoneId !== origMilestoneId;
      const usesW = reportNodeUsesWeight(globalNodes, editingReport.templateId);
      const matrix = batchDetailMatrix;
      const weightParts =
        matrix && usesW && typeof f.weightKg === 'number' && Number.isFinite(f.weightKg)
          ? distributeReportWeightsByGoodQty(f.weightKg, f.rowEdits.map(r => ({ quantity: Math.max(0, r.quantity) })))
          : null;
      const fr = reportDetailBatch.first as OrderReportRow;
      const equipFromBatch = (fr.report as { equipmentId?: string }).equipmentId;
      const batchIdPersist = (fr.report.reportBatchId ?? undefined) as string | undefined;
      const reportNoPersist = (fr.report.reportNo ?? undefined) as string | undefined;
      let idx = 0;
      for (const row of f.rowEdits) {
        const weight = reportBatchRowWeightForPayload({
          usesWeight: usesW, isMatrix: !!matrix, batchTotalWeightKg: f.weightKg,
          distributedParts: weightParts, rowIndex: idx, rowWeightKg: row.weightKg,
        });
        idx += 1;
        const qGood = Math.max(0, row.quantity);
        const qDef = Math.max(0, row.defectiveQuantity);
        if (matrixMode && row.variantId && !row.reportId) {
          if (qGood + qDef <= 0) continue;
          if (!onReportSubmit) {
            toast.error('无法新增规格：缺少报工提交回调');
            continue;
          }
          await onReportSubmit(
            row.orderId,
            row.milestoneId,
            qGood,
            customDataPayload as Record<string, unknown> | null,
            row.variantId,
            f.workerId || undefined,
            qDef,
            equipFromBatch,
            batchIdPersist,
            reportNoPersist,
            usesW && weight !== undefined ? weight : undefined,
          );
          continue;
        }
        await onUpdateReport({
          orderId: row.orderId, milestoneId: row.milestoneId, reportId: row.reportId,
          quantity: qGood, defectiveQuantity: qDef,
          timestamp: tsStr, operator: f.operator,
          newMilestoneId: changedMilestone ? editingReport.milestoneId : undefined,
          customData: customDataPayload,
          ...(usesW && weight !== undefined ? { weight } : {}),
        });
      }
    } else if (reportDetailBatch.source === 'product' && onUpdateReportProduct) {
      const origTemplateId = reportDetailBatch.milestoneTemplateId;
      const changedTemplate = editingReport.templateId !== origTemplateId;
      const usesW = reportNodeUsesWeight(globalNodes, editingReport.templateId);
      const matrix = batchDetailMatrix;
      const weightParts =
        matrix && usesW && typeof f.weightKg === 'number' && Number.isFinite(f.weightKg)
          ? distributeReportWeightsByGoodQty(f.weightKg, f.rowEdits.map(r => ({ quantity: Math.max(0, r.quantity) })))
          : null;
      const fr = reportDetailBatch.first as ProductReportRow;
      const equipFromBatch = (fr.report as { equipmentId?: string }).equipmentId;
      const batchIdPersist = (fr.report.reportBatchId ?? undefined) as string | undefined;
      const reportNoPersist = (fr.report.reportNo ?? undefined) as string | undefined;
      let idx = 0;
      for (const row of f.rowEdits) {
        const weight = reportBatchRowWeightForPayload({
          usesWeight: usesW, isMatrix: !!matrix, batchTotalWeightKg: f.weightKg,
          distributedParts: weightParts, rowIndex: idx, rowWeightKg: row.weightKg,
        });
        idx += 1;
        const qGood = Math.max(0, row.quantity);
        const qDef = Math.max(0, row.defectiveQuantity);
        if (matrixMode && row.variantId && !row.reportId) {
          if (qGood + qDef <= 0) continue;
          if (!onReportSubmitProduct) {
            toast.error('无法新增规格：缺少报工提交回调');
            continue;
          }
          await onReportSubmitProduct(
            editingReport.productId,
            editingReport.templateId,
            qGood,
            customDataPayload as Record<string, unknown> | null,
            row.variantId,
            f.workerId || undefined,
            qDef,
            equipFromBatch,
            batchIdPersist,
            reportNoPersist,
            usesW && weight !== undefined ? weight : undefined,
          );
          continue;
        }
        if (!row.progressId) continue;
        await onUpdateReportProduct({
          progressId: row.progressId, reportId: row.reportId,
          quantity: qGood, defectiveQuantity: qDef,
          timestamp: tsStr, operator: f.operator,
          newMilestoneTemplateId: changedTemplate ? editingReport.templateId : undefined,
          customData: customDataPayload,
          ...(usesW && weight !== undefined ? { weight } : {}),
        });
      }
    }
    if (onUpdateProduct && f.rate >= 0) {
      const product = productMap.get(editingReport.productId);
      if (product) {
        onUpdateProduct({
          ...product,
          nodeRates: { ...(product.nodeRates || {}), [editingReport.templateId]: f.rate },
        });
      }
    }
    setEditingReport(null);
    onClose();
  };
  const handleEnterEdit = () => {
    if (reportDetailBatch.rows.length === 0) return;
    if (reportDetailBatch.source === 'order') {
      if (!onUpdateReport) return;
      const { order, milestone, report } = (reportDetailBatch.rows as OrderReportRow[])[0];
      const ts = report.timestamp;
      let dt = new Date(ts);
      if (isNaN(dt.getTime())) dt = new Date();
      const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      const product = productMap.get(order.productId);
      const rate = product?.nodeRates?.[milestone.templateId] ?? 0;
      const matchingWorker = workers.find(w => w.name === report.operator);
      const msFull = order.milestones?.find(m => m.templateId === milestone.templateId);
      const customData = mergeCustomDataForTemplate(
        report.customData, milestone.templateId, msFull?.reportTemplate,
        product?.routeReportValues?.[milestone.templateId], globalNodes,
      );
      const tidInit = milestone.templateId;
      const usesWInit = reportNodeUsesWeight(globalNodes, tidInit);
      const sumBatchW = (reportDetailBatch.rows as OrderReportRow[]).reduce(
        (s, row) => s + weightToNumberSumPart(row.report.weight), 0,
      );
      if (reportDetailBatch.rows.length > 1) {
        const first = JSON.stringify(report.customData ?? {});
        const hasDiff = reportDetailBatch.rows.some(r => JSON.stringify(r.report.customData ?? {}) !== first);
        if (hasDiff) toast.warning('批次内各行的填报项数据不一致，编辑后将统一为同一份填报项');
      }
      if (batchDetailMatrix) {
        if (!onReportSubmit) {
          toast.error('无法补录新规格：缺少报工提交回调');
          return;
        }
        const { layout } = batchDetailMatrix;
        const ordRows = reportDetailBatch.rows as OrderReportRow[];
        const rowEdits: BatchRowEdit[] = [];
        const variantMap = new Map<string, OrderReportRow>();
        for (const or of ordRows) {
          const vid = or.report.variantId;
          if (vid) variantMap.set(vid, or);
        }
        for (const cr of layout.colorRows) {
          for (const v of cr.variantAtSize) {
            if (!v) continue;
            const hit = variantMap.get(v.id);
            if (hit) {
              rowEdits.push({
                reportId: hit.report.id,
                variantId: v.id,
                orderId: hit.order.id,
                milestoneId: hit.milestone.id,
                quantity: hit.report.quantity,
                defectiveQuantity: hit.report.defectiveQuantity ?? 0,
              });
            } else {
              const { orderId, milestoneId } = resolveOrderMilestoneForVariant(ordRows, v.id, milestone.templateId);
              rowEdits.push({
                reportId: '',
                variantId: v.id,
                orderId,
                milestoneId,
                quantity: 0,
                defectiveQuantity: 0,
              });
            }
          }
        }
        setEditingReport({
          orderId: order.id, milestoneId: milestone.id,
          templateId: milestone.templateId, productId: order.productId,
          form: {
            timestamp: tsStr, operator: report.operator,
            workerId: matchingWorker?.id || '', rate, customData,
            ...(usesWInit ? { weightKg: sumBatchW > 0 ? sumBatchW : '' as const } : {}),
            rowEdits,
          },
        });
        return;
      }
      setEditingReport({
        orderId: order.id, milestoneId: milestone.id,
        templateId: milestone.templateId, productId: order.productId,
        form: {
          timestamp: tsStr, operator: report.operator,
          workerId: matchingWorker?.id || '', rate, customData,
          ...(batchDetailMatrix && usesWInit ? { weightKg: sumBatchW > 0 ? sumBatchW : '' as const } : {}),
          rowEdits: (reportDetailBatch.rows as OrderReportRow[]).map(({ order: o, milestone: m, report: r }) => ({
            reportId: r.id, orderId: o.id, milestoneId: m.id,
            quantity: r.quantity, defectiveQuantity: r.defectiveQuantity ?? 0,
            ...(!batchDetailMatrix && usesWInit ? { weightKg: parseWeightFieldForEdit(r.weight) } : {}),
          })),
        },
      });
    } else {
      if (!onUpdateReportProduct) return;
      const { progress, report } = (reportDetailBatch.rows as ProductReportRow[])[0];
      const ts = report.timestamp;
      let dt = new Date(ts);
      if (isNaN(dt.getTime())) dt = new Date();
      const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      const product = productMap.get(progress.productId);
      const rate = product?.nodeRates?.[progress.milestoneTemplateId] ?? 0;
      const matchingWorker = workers.find(w => w.name === report.operator);
      const customData = mergeCustomDataForTemplate(
        report.customData, progress.milestoneTemplateId, undefined,
        product?.routeReportValues?.[progress.milestoneTemplateId], globalNodes,
      );
      const tidInit = progress.milestoneTemplateId;
      const usesWInit = reportNodeUsesWeight(globalNodes, tidInit);
      const sumBatchW = (reportDetailBatch.rows as ProductReportRow[]).reduce(
        (s, row) => s + weightToNumberSumPart(row.report.weight), 0,
      );
      if (reportDetailBatch.rows.length > 1) {
        const first = JSON.stringify(report.customData ?? {});
        const hasDiff = reportDetailBatch.rows.some(r => JSON.stringify(r.report.customData ?? {}) !== first);
        if (hasDiff) toast.warning('批次内各行的填报项数据不一致，编辑后将统一为同一份填报项');
      }
      if (batchDetailMatrix) {
        if (!onReportSubmitProduct) {
          toast.error('无法补录新规格：缺少报工提交回调');
          return;
        }
        const { layout } = batchDetailMatrix;
        const prRows = reportDetailBatch.rows as ProductReportRow[];
        const rowEdits: BatchRowEdit[] = [];
        const variantMap = new Map<string, ProductReportRow>();
        for (const pr of prRows) {
          variantMap.set(pr.progress.variantId, pr);
        }
        for (const cr of layout.colorRows) {
          for (const v of cr.variantAtSize) {
            if (!v) continue;
            const hit = variantMap.get(v.id);
            if (hit) {
              rowEdits.push({
                reportId: hit.report.id,
                variantId: v.id,
                orderId: '',
                milestoneId: '',
                progressId: hit.progress.id,
                quantity: hit.report.quantity,
                defectiveQuantity: hit.report.defectiveQuantity ?? 0,
              });
            } else {
              rowEdits.push({
                reportId: '',
                variantId: v.id,
                orderId: '',
                milestoneId: '',
                progressId: '',
                quantity: 0,
                defectiveQuantity: 0,
              });
            }
          }
        }
        setEditingReport({
          orderId: '', milestoneId: '',
          templateId: progress.milestoneTemplateId, productId: progress.productId,
          form: {
            timestamp: tsStr, operator: report.operator,
            workerId: matchingWorker?.id || '', rate, customData,
            ...(usesWInit ? { weightKg: sumBatchW > 0 ? sumBatchW : '' as const } : {}),
            rowEdits,
          },
        });
        return;
      }
      setEditingReport({
        orderId: '', milestoneId: '',
        templateId: progress.milestoneTemplateId, productId: progress.productId,
        form: {
          timestamp: tsStr, operator: report.operator,
          workerId: matchingWorker?.id || '', rate, customData,
          ...(batchDetailMatrix && usesWInit ? { weightKg: sumBatchW > 0 ? sumBatchW : '' as const } : {}),
          rowEdits: (reportDetailBatch.rows as ProductReportRow[]).map(({ progress: pr, report: r }) => ({
            reportId: r.id, orderId: '', milestoneId: '', progressId: pr.id,
            quantity: r.quantity, defectiveQuantity: r.defectiveQuantity ?? 0,
            ...(!batchDetailMatrix && usesWInit ? { weightKg: parseWeightFieldForEdit(r.weight) } : {}),
          })),
        },
      });
    }
  };
  const handleDelete = (() => {
    if (reportDetailBatch.source === 'order' && onDeleteReport) {
      return () => {
        (reportDetailBatch.rows as OrderReportRow[]).forEach(({ order, milestone, report }) => {
          onDeleteReport({ orderId: order.id, milestoneId: milestone.id, reportId: report.id });
        });
        setEditingReport(null);
        onClose();
      };
    }
    if (reportDetailBatch.source === 'product' && onDeleteReportProduct) {
      return () => {
        (reportDetailBatch.rows as ProductReportRow[]).forEach(({ progress, report }) => {
          onDeleteReportProduct({ progressId: progress.id, reportId: report.id });
        });
        setEditingReport(null);
        onClose();
      };
    }
    return undefined;
  })();

  return (
    <DocPhaseModal
      zIndexClass="z-[90]"
      open
      phase={editingReport ? 'edit' : 'detail'}
      editingDocNumber={reportDetailBatch.source === 'order' ? (reportDetailBatch.first as OrderReportRow).order.orderNumber : (reportDetailBatch.productName || '—')}
      maxWidthClass="max-w-4xl"
      detailTitle="报工详情"
      editTitle="报工 · 编辑"
      newTitle=""
      leadingDetailActions={
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
      }
      hasPerm={hasOrderPerm}
      viewPerm="production:orders_report_records:view"
      editPerm="production:orders_report_records:edit"
      deletePerm={handleDelete ? 'production:orders_report_records:delete' : undefined}
      deleteConfirmMessage="确定要删除该次报工的所有记录吗？此操作不可恢复。"
      onDelete={handleDelete}
      renderDocBadge={() => (
        <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
          {reportDetailBatch.source === 'order' ? (reportDetailBatch.first as OrderReportRow).order.orderNumber : '产品'}
        </span>
      )}
      onClose={handleClose}
      onEnterEdit={handleEnterEdit}
      onCancelEdit={() => setEditingReport(null)}
      renderContent={() => (
        <>
          <ReportBatchEditSavePortal active={!!editingReport} onSave={handleSave} />
          <div className="space-y-4">
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
            const editFlatUsesWeight = reportNodeUsesWeight(globalNodes, tid);
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
                        setEditingReport(prev => {
                          if (!prev) return prev;
                          const nextRows = prev.form.rowEdits.map(row => {
                            if (!row.orderId) return row;
                            const o = orders.find(ox => ox.id === row.orderId);
                            const nm = o?.milestones.find(m => m.templateId === newTemplateId);
                            return nm ? { ...row, milestoneId: nm.id } : row;
                          });
                          return {
                            ...prev,
                            templateId: newTemplateId,
                            milestoneId: newMilestone?.id || prev.milestoneId,
                            form: { ...prev.form, rate: newRate, customData: newCd, rowEdits: nextRows },
                          };
                        });
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
                      variant="form"
                      icon={UserPlus}
                    />
                  </div>
                  {!batchDetailMatrix ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">工价</label>
                      <div className="flex flex-wrap items-center gap-2">
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
                          className="h-9 w-[6rem] rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <span className="text-xs text-slate-500">
                          元/
                          {(productMap.get(editingReport.productId)?.unitId &&
                            dictionaries.units.find(u => u.id === productMap.get(editingReport.productId)?.unitId)?.name) ||
                            '件'}
                        </span>
                      </div>
                    </div>
                  ) : null}
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
                        inputClassName="h-9 w-full max-w-md rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        fileHint="已选择文件，保存后生效"
                      />
                    </div>
                  </div>
                );
              })()}
              {batchDetailMatrix ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细（按规格）</p>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    {(() => {
                      const { layout, product: matrixProduct } = batchDetailMatrix;
                      const editNodeUsesWeight = reportNodeUsesWeight(globalNodes, editingReport.templateId);
                      const matrixUnit =
                        (matrixProduct.unitId &&
                          dictionaries.units.find(u => u.id === matrixProduct.unitId)?.name) ||
                        '件';
                      const goodTotal = editingReport.form.rowEdits.reduce((s, r) => s + r.quantity, 0);
                      const amountTotal = editingReport.form.rowEdits.reduce(
                        (s, r) => s + r.quantity * editingReport.form.rate,
                        0,
                      );
                      const categoryForMatrix = matrixProduct.categoryId
                        ? categoryMap.get(matrixProduct.categoryId)
                        : undefined;
                      const matrixCustomTags = getProductCategoryCustomFieldEntries(
                        matrixProduct,
                        categoryForMatrix ?? null,
                        { includeFile: false, includeEmpty: false },
                      );
                      const matrixColSpan = 4 + (editNodeUsesWeight ? 1 : 0);
                      const isOrderBatch = reportDetailBatch.source === 'order';
                      const rows: QtyMatrixTableRow[] = layout.colorRows.map(row => {
                        let rowSum = 0;
                        const cells = row.variantAtSize.map((variant: ProductVariant | null, si: number) => {
                          if (!variant) {
                            return <span key={`${row.key}-e-${si}`} className="text-sm text-slate-300">—</span>;
                          }
                          const rowEdit = editingReport.form.rowEdits.find(r => r.variantId === variant.id);
                          if (!rowEdit) {
                            return <span key={variant.id} className="text-sm text-slate-300">—</span>;
                          }
                          rowSum += rowEdit.quantity;
                          const otherGoodSum = editingReport.form.rowEdits
                            .filter(r => r.variantId !== variant.id)
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
                                                r.variantId === variant.id ? { ...r, quantity: v } : r,
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
                                        r.variantId === variant.id ? { ...r, defectiveQuantity: v } : r,
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
                      const productThumbEdit = matrixProduct.imageUrl ? (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
                          <img
                            src={matrixProduct.imageUrl}
                            alt={matrixProduct.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                          <Package className="h-4 w-4" />
                        </div>
                      );
                      return (
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                              <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                              <th className="py-2.5 px-3 text-right">数量</th>
                              <th className="py-2.5 px-3 text-right">工价</th>
                              <th className="py-2.5 px-3 text-right">金额(元)</th>
                              {editNodeUsesWeight ? (
                                <th
                                  className="py-2.5 px-3 text-right whitespace-nowrap"
                                  title="工序开启称重时，本批报工总重量（kg），保存时按各规格良品数量比例写入各条记录"
                                >
                                  重量 (kg)
                                </th>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            <tr>
                              <td className="py-2.5 px-3 align-top">
                                <div className="flex min-w-0 items-start gap-2">
                                  {productThumbEdit}
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                      <span className="font-bold text-slate-700">{matrixProduct.name}</span>
                                      {matrixProduct.sku ? (
                                        <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                          {matrixProduct.sku}
                                        </span>
                                      ) : null}
                                    </div>
                                    {matrixCustomTags.length > 0 ? (
                                      <div className="mt-1 flex flex-wrap items-center gap-1">
                                        {matrixCustomTags.map(({ field, display }) => (
                                          <span
                                            key={field.id}
                                            className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                          >
                                            {field.label}: {display}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right align-middle">
                                <span className="font-black text-indigo-600 tabular-nums">
                                  {goodTotal.toLocaleString()} {matrixUnit}
                                </span>
                                {editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0) > 0 ? (
                                  <span className="mt-0.5 block text-[10px] font-medium text-amber-700 tabular-nums">
                                    不良{' '}
                                    {editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0)}{' '}
                                    {matrixUnit}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2.5 px-3 align-middle text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={editingReport.form.rate}
                                    onChange={e =>
                                      setEditingReport(prev =>
                                        prev
                                          ? { ...prev, form: { ...prev.form, rate: parseFloat(e.target.value) || 0 } }
                                          : prev,
                                      )
                                    }
                                    className="h-9 w-[5.25rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                  />
                                  <span className="shrink-0 text-xs font-medium whitespace-nowrap text-slate-500">
                                    元/{matrixUnit}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-indigo-600 tabular-nums">
                                {amountTotal > 0 ? amountTotal.toFixed(2) : '—'}
                              </td>
                              {editNodeUsesWeight ? (
                                <td className="py-2.5 px-3 align-middle text-right">
                                  <div className="inline-flex items-center justify-end">
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.0001}
                                      value={
                                        editingReport.form.weightKg === ''
                                          ? ''
                                          : typeof editingReport.form.weightKg === 'number'
                                            ? editingReport.form.weightKg
                                            : ''
                                      }
                                      onChange={e => {
                                        const raw = e.target.value.trim();
                                        if (raw === '') {
                                          setEditingReport(prev =>
                                            prev ? { ...prev, form: { ...prev.form, weightKg: '' } } : prev,
                                          );
                                          return;
                                        }
                                        const n = parseFloat(raw);
                                        if (!Number.isFinite(n) || n < 0) return;
                                        setEditingReport(prev =>
                                          prev ? { ...prev, form: { ...prev.form, weightKg: n } } : prev,
                                        );
                                      }}
                                      placeholder="kg"
                                      title="本批报工总重量 (kg)"
                                      className="h-9 w-full max-w-[6.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                </td>
                              ) : null}
                            </tr>
                            <tr className="bg-slate-50/70">
                              <td
                                colSpan={matrixColSpan}
                                className="border-t border-slate-100 px-3 pb-3 pt-2 align-top"
                              >
                                <QtyMatrixTable
                                  sizeHeaders={layout.sizeColumns.map(c => c.header)}
                                  rows={rows}
                                  dense
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      );
                    })()}
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
                      {editFlatUsesWeight ? (
                        <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">
                          重量 (kg)
                        </th>
                      ) : null}
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
                              {editFlatUsesWeight ? (
                                <td className="px-3 py-2.5 sm:px-4 align-middle text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.0001}
                                    value={rowEdit.weightKg === '' || rowEdit.weightKg === undefined ? '' : rowEdit.weightKg}
                                    onChange={e => {
                                      const raw = e.target.value.trim();
                                      if (raw === '') {
                                        setEditingReport(prev =>
                                          prev
                                            ? {
                                                ...prev,
                                                form: {
                                                  ...prev.form,
                                                  rowEdits: prev.form.rowEdits.map(r =>
                                                    r.reportId === report.id ? { ...r, weightKg: '' } : r,
                                                  ),
                                                },
                                              }
                                            : prev,
                                        );
                                        return;
                                      }
                                      const n = parseFloat(raw);
                                      if (!Number.isFinite(n) || n < 0) return;
                                      setEditingReport(prev =>
                                        prev
                                          ? {
                                              ...prev,
                                              form: {
                                                ...prev.form,
                                                rowEdits: prev.form.rowEdits.map(r =>
                                                  r.reportId === report.id ? { ...r, weightKg: n } : r,
                                                ),
                                              },
                                            }
                                          : prev,
                                      );
                                    }}
                                    placeholder="kg"
                                    className="ml-auto block h-8 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                                  />
                                </td>
                              ) : null}
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
                              {editFlatUsesWeight ? (
                                <td className="px-3 py-2.5 sm:px-4 align-middle text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.0001}
                                    value={rowEdit.weightKg === '' || rowEdit.weightKg === undefined ? '' : rowEdit.weightKg}
                                    onChange={e => {
                                      const raw = e.target.value.trim();
                                      if (raw === '') {
                                        setEditingReport(prev =>
                                          prev
                                            ? {
                                                ...prev,
                                                form: {
                                                  ...prev.form,
                                                  rowEdits: prev.form.rowEdits.map(r =>
                                                    r.reportId === report.id ? { ...r, weightKg: '' } : r,
                                                  ),
                                                },
                                              }
                                            : prev,
                                        );
                                        return;
                                      }
                                      const n = parseFloat(raw);
                                      if (!Number.isFinite(n) || n < 0) return;
                                      setEditingReport(prev =>
                                        prev
                                          ? {
                                              ...prev,
                                              form: {
                                                ...prev.form,
                                                rowEdits: prev.form.rowEdits.map(r =>
                                                  r.reportId === report.id ? { ...r, weightKg: n } : r,
                                                ),
                                              },
                                            }
                                          : prev,
                                      );
                                    }}
                                    placeholder="kg"
                                    className="ml-auto block h-8 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                                  />
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
          })() : (
            <>
              {(() => {
                const productId = reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.productId : reportDetailBatch.productId;
                const p = products.find(px => px.id === productId);
                const unitName = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                const milestoneName = reportDetailBatch.source === 'order'
                  ? reportDetailBatch.first.milestone.name
                  : reportDetailBatch.milestoneName;
                const tid = reportDetailBatch.source === 'order' ? reportDetailBatch.first.milestone.templateId : reportDetailBatch.milestoneTemplateId;
                const ms =
                  reportDetailBatch.source === 'order'
                    ? reportDetailBatch.first.order.milestones?.find(m => m.templateId === tid)
                    : undefined;
                const tmpl = getEffectiveReportTemplate(ms ?? { templateId: tid, reportTemplate: [] }, globalNodes);
                const cd = reportDetailBatch.first.report?.customData;
                const entries = getReportCustomDataDisplayEntries(cd, tmpl);
                const orderNo =
                  reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.orderNumber : null;
                const batchNoLabel = reportDetailBatch.reportNo?.trim() || null;
                return (
                  <DocSummaryCard
                    className="mb-5"
                    main={
                      <>
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
                          {orderNo ? (
                            <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                              {orderNo}
                            </span>
                          ) : null}
                          {batchNoLabel ? (
                            <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-indigo-600">
                              {batchNoLabel}
                            </span>
                          ) : null}
                          <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm" title="工序">
                            工序：{milestoneName || '—'}
                          </span>
                        </div>
                        <DocInlineMetaRow className="mt-1.5">
                          {reportDetailBatch.first.report.timestamp ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                              <span className="normal-case">添加 {fmtDT(reportDetailBatch.first.report.timestamp)}</span>
                            </span>
                          ) : null}
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                            <span className="normal-case">经办: {reportDetailBatch.first.report.operator || '—'}</span>
                          </span>
                          {entries.map(e => (
                            <span
                              key={e.fieldId}
                              className="inline-flex max-w-full min-w-0 items-center gap-1.5 normal-case"
                            >
                              <span className="shrink-0 text-slate-400">{e.label}:</span>
                              <span className="min-w-0 font-bold text-slate-700 break-all">{e.display}</span>
                            </span>
                          ))}
                        </DocInlineMetaRow>
                      </>
                    }
                    side={
                      <>
                        <div className="min-w-[6.5rem] md:text-right">
                          <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">本次报工</p>
                          <p className="font-black tabular-nums text-slate-800">
                            {reportDetailBatch.totalGood.toLocaleString()} {unitName}
                          </p>
                        </div>
                        {reportDetailBatch.totalAmount > 0 ? (
                          <div className="min-w-[6.5rem] md:text-right">
                            <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">本批金额</p>
                            <p className="font-black tabular-nums text-emerald-600">¥{reportDetailBatch.totalAmount.toFixed(2)}</p>
                          </div>
                        ) : null}
                        {reportDetailViewNodeUsesWeight && reportDetailBatchTotalWeightKg > 0 ? (
                          <div className="min-w-[6.5rem] md:text-right">
                            <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">本批重量</p>
                            <p className="font-black tabular-nums text-slate-800">
                              {formatReportWeightKgDisplay(reportDetailBatchTotalWeightKg)} kg
                            </p>
                          </div>
                        ) : null}
                      </>
                    }
                  />
                );
              })()}
              <div className="flex-1 overflow-auto pb-4 -mt-1">
                {batchDetailMatrix ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细（按规格）</p>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      {(() => {
                        const { layout, goodByVariant, defectiveByVariant, variantToReportId, product: viewMatrixProduct } =
                          batchDetailMatrix;
                        const viewMatrixUnit =
                          (viewMatrixProduct.unitId &&
                            dictionaries.units.find(u => u.id === viewMatrixProduct.unitId)?.name) ||
                          '件';
                        const viewMatrixCustomTags = getProductCategoryCustomFieldEntries(
                          viewMatrixProduct,
                          viewMatrixProduct.categoryId ? categoryMap.get(viewMatrixProduct.categoryId) ?? null : null,
                          { includeFile: false, includeEmpty: false },
                        );
                        const viewMatrixColSpan = 4 + (reportDetailViewNodeUsesWeight ? 1 : 0);
                        const viewMatrixRate =
                          reportDetailBatch.source === 'order'
                            ? (() => {
                                const r0 = reportDetailBatch.rows[0] as OrderReportRow;
                                return (
                                  r0.report.rate ??
                                  viewMatrixProduct.nodeRates?.[r0.milestone.templateId] ??
                                  0
                                );
                              })()
                            : (() => {
                                const r0 = reportDetailBatch.rows[0] as ProductReportRow;
                                return (
                                  r0.report.rate ??
                                  viewMatrixProduct.nodeRates?.[r0.progress.milestoneTemplateId] ??
                                  0
                                );
                              })();
                        const productThumbView = viewMatrixProduct.imageUrl ? (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
                            <img
                              src={viewMatrixProduct.imageUrl}
                              alt={viewMatrixProduct.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                            <Package className="h-4 w-4" />
                          </div>
                        );
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
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                                <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                                <th className="py-2.5 px-3 text-right">数量</th>
                                <th className="py-2.5 px-3 text-right">工价</th>
                                <th className="py-2.5 px-3 text-right">金额(元)</th>
                                {reportDetailViewNodeUsesWeight ? (
                                  <th className="py-2.5 px-3 text-right whitespace-nowrap">重量 (kg)</th>
                                ) : null}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              <tr>
                                <td className="py-2.5 px-3 align-top">
                                  <div className="flex min-w-0 items-start gap-2">
                                    {productThumbView}
                                    <div className="min-w-0">
                                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                        <span className="font-bold text-slate-700">{viewMatrixProduct.name}</span>
                                        {viewMatrixProduct.sku ? (
                                          <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                            {viewMatrixProduct.sku}
                                          </span>
                                        ) : null}
                                      </div>
                                      {viewMatrixCustomTags.length > 0 ? (
                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                          {viewMatrixCustomTags.map(({ field, display }) => (
                                            <span
                                              key={field.id}
                                              className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                            >
                                              {field.label}: {display}
                                            </span>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right align-middle">
                                  <span className="font-black text-indigo-600 tabular-nums">
                                    {reportDetailBatch.totalGood.toLocaleString()} {viewMatrixUnit}
                                  </span>
                                  {reportDetailBatch.totalDefective > 0 ? (
                                    <span className="mt-0.5 block text-[10px] font-medium text-amber-700 tabular-nums">
                                      不良 {reportDetailBatch.totalDefective} {viewMatrixUnit}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="py-2.5 px-3 text-right align-middle text-xs text-slate-600">
                                  {viewMatrixRate > 0 ? `${viewMatrixRate.toFixed(2)} 元/${viewMatrixUnit}` : '—'}
                                </td>
                                <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-indigo-600 tabular-nums">
                                  {reportDetailBatch.totalAmount > 0 ? reportDetailBatch.totalAmount.toFixed(2) : '—'}
                                </td>
                                {reportDetailViewNodeUsesWeight ? (
                                  <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                                    {formatReportWeightKgDisplay(reportDetailBatchTotalWeightKg)}
                                  </td>
                                ) : null}
                              </tr>
                              <tr className="bg-slate-50/70">
                                <td
                                  colSpan={viewMatrixColSpan}
                                  className="border-t border-slate-100 px-3 pb-3 pt-2 align-top"
                                >
                                  <QtyMatrixTable
                                    sizeHeaders={layout.sizeColumns.map(c => c.header)}
                                    rows={rows}
                                    dense
                                  />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        );
                      })()}
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
                          {reportDetailViewNodeUsesWeight ? (
                            <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">
                              重量 (kg)
                            </th>
                          ) : null}
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
                                  {reportDetailViewNodeUsesWeight ? (
                                    <td className="px-3 py-2.5 sm:px-4 align-middle text-right text-xs font-bold tabular-nums text-slate-700">
                                      {formatReportWeightKgDisplay(report.weight)}
                                    </td>
                                  ) : null}
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
                                  {reportDetailViewNodeUsesWeight ? (
                                    <td className="px-3 py-2.5 sm:px-4 align-middle text-right text-xs font-bold tabular-nums text-slate-700">
                                      {formatReportWeightKgDisplay(report.weight)}
                                    </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                      </tbody>
                    </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          </div>
        </>
      )}
    />
  );
};

export default React.memo(ReportBatchDetailModal);
