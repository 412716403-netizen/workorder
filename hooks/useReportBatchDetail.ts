/**
 * ReportBatchDetailModal 的状态与 handler 集中托管 hook (Phase P3 抽离)。
 *
 * 持有:
 * - editingReport: 编辑模式下的临时表单 state (含每行良品/不良/重量)
 *
 * 暴露:
 * - handleEnterEdit / handleSave / handleDelete / handleClose
 * - matrix vs flat 模式自动判断 (按 batchDetailMatrix prop)
 */
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type {
  ProductionOrder,
  Product,
  GlobalNodeTemplate,
  Worker,
  ProductMilestoneProgress,
} from '../types';
import {
  weightToNumberSumPart,
  parseWeightFieldForEdit,
  distributeReportWeightsByGoodQty,
} from '../utils/reportBatchWeightHelpers';
import { mergeCustomDataForTemplate } from '../utils/effectiveReportTemplate';
import { reportBatchRowWeightForPayload } from '../utils/reportBatchSaveWeight';
import type { BatchDetailMatrix } from '../views/order-list/report-batch/ReportBatchItemsTable';

export type OrderReportRow = {
  order: ProductionOrder;
  milestone: { id: string; name: string; templateId: string };
  report: {
    id: string; timestamp: string; operator: string; quantity: number;
    defectiveQuantity?: number; variantId?: string; reportBatchId?: string; reportNo?: string;
    weight?: unknown;
    customData?: Record<string, unknown>;
    [k: string]: unknown;
  };
};
export type ProductReportRow = { progress: ProductMilestoneProgress; report: OrderReportRow['report'] };

export type ReportDetailBatch =
  | { source: 'order'; key: string; rows: OrderReportRow[]; first: OrderReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string }
  | { source: 'product'; key: string; progressId: string; productId: string; productName: string; milestoneName: string; milestoneTemplateId: string; rows: ProductReportRow[]; first: ProductReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string };

export type BatchRowEdit = {
  reportId: string;
  variantId?: string;
  orderId: string;
  milestoneId: string;
  progressId?: string;
  quantity: number;
  defectiveQuantity: number;
  weightKg?: number | '';
};

export type EditingReportState = {
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
    weightKg?: number | '';
    rowEdits: BatchRowEdit[];
  };
} | null;

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

interface UseReportBatchDetailArgs {
  reportDetailBatch: ReportDetailBatch;
  batchDetailMatrix: BatchDetailMatrix | null;
  productMap: Map<string, Product>;
  orders: ProductionOrder[];
  globalNodes: GlobalNodeTemplate[];
  workers: Worker[];
  onClose: () => void;
  onUpdateReport?: (params: ReportUpdateParams) => void;
  onDeleteReport?: (params: { orderId: string; milestoneId: string; reportId: string }) => void;
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, unknown>; weight?: number | null }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
  onUpdateProduct?: (product: Product) => Promise<Product | null>;
  onReportSubmit?: (oId: string, mId: string, qty: number, data: Record<string, unknown> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
  onReportSubmitProduct?: (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, unknown> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
}

function reportNodeUsesWeight(globalNodes: GlobalNodeTemplate[], templateId: string): boolean {
  return !!globalNodes.find(n => n.id === templateId)?.enableWeightOnReport;
}

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

export function useReportBatchDetail(args: UseReportBatchDetailArgs) {
  const {
    reportDetailBatch,
    batchDetailMatrix,
    productMap,
    orders,
    globalNodes,
    workers,
    onClose,
    onUpdateReport,
    onDeleteReport,
    onUpdateReportProduct,
    onDeleteReportProduct,
    onUpdateProduct,
    onReportSubmit,
    onReportSubmitProduct,
  } = args;

  const [editingReport, setEditingReport] = useState<EditingReportState>(null);

  const handleClose = useCallback(() => {
    setEditingReport(null);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
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
  }, [editingReport, batchDetailMatrix, reportDetailBatch, onUpdateReport, onUpdateReportProduct, onUpdateProduct, onReportSubmit, onReportSubmitProduct, globalNodes, productMap, onClose]);

  const handleEnterEdit = useCallback(() => {
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
  }, [reportDetailBatch, batchDetailMatrix, productMap, workers, globalNodes, onUpdateReport, onUpdateReportProduct, onReportSubmit, onReportSubmitProduct]);

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

  // unused warning silenced; orders is currently only forwarded to EditFlow for resolveOrderById
  void orders;

  return {
    editingReport,
    setEditingReport,
    handleClose,
    handleSave,
    handleEnterEdit,
    handleDelete,
  };
}
