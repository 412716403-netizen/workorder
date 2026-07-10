/**
 * 报工审核 · 只读详情（布局对齐 ReportBatchDetailModal / ReportBatchItemsTable）
 */
import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import type {
  AppDictionaries,
  GlobalNodeTemplate,
  Product,
  ProductCategory,
  ProductionOpRecord,
  ProductionOrder,
} from '../../types';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import { weightToNumberSumPart } from '../../utils/reportBatchWeightHelpers';
import type { ReportDetailBatch, OrderReportRow, ProductReportRow } from '../../hooks/useReportBatchDetail';
import ReportBatchItemsTable, { type BatchDetailMatrix } from './report-batch/ReportBatchItemsTable';

interface ReportPendingApprovalDetailModalProps {
  batch: ReportDetailBatch;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  prodRecords: ProductionOpRecord[];
}

function reportNodeUsesWeight(globalNodes: GlobalNodeTemplate[], templateId: string): boolean {
  return !!globalNodes.find((n) => n.id === templateId)?.enableWeightOnReport;
}

const ReportPendingApprovalDetailModal: React.FC<ReportPendingApprovalDetailModalProps> = ({
  batch,
  onClose,
  products,
  categories,
  dictionaries,
  globalNodes,
  prodRecords,
}) => {
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const batchDetailMatrix = useMemo<BatchDetailMatrix | null>(() => {
    const b = batch;
    const productId = b.source === 'order' ? b.first.order.productId : b.productId;
    const p = products.find((px) => px.id === productId);
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
    return { product: p, layout, variantToReportId, goodByVariant, defectiveByVariant };
  }, [batch, products, categoryMap, dictionaries]);

  const reportDetailViewTemplateId =
    batch.source === 'order' ? batch.first.milestone.templateId : batch.milestoneTemplateId;
  const reportDetailViewNodeUsesWeight = useMemo(
    () => reportNodeUsesWeight(globalNodes, reportDetailViewTemplateId),
    [globalNodes, reportDetailViewTemplateId],
  );

  const reportDetailBatchTotalWeightKg = useMemo(() => {
    if (batch.source === 'order') {
      return (batch.rows as OrderReportRow[]).reduce<number>(
        (s, { report }) => s + weightToNumberSumPart(report.weight),
        0,
      );
    }
    return (batch.rows as ProductReportRow[]).reduce<number>(
      (s, { report }) => s + weightToNumberSumPart(report.weight),
      0,
    );
  }, [batch]);

  const displayDocNo =
    batch.reportNo?.trim() ||
    (batch.source === 'order' ? batch.first.order.orderNumber : batch.productName) ||
    '—';

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[28px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-slate-800">报工审核 · 详情</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{displayDocNo}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-50 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
          <ReportBatchItemsTable
            batch={batch}
            batchDetailMatrix={batchDetailMatrix}
            products={products}
            categoryMap={categoryMap}
            dictionaries={dictionaries}
            globalNodes={globalNodes}
            prodRecords={prodRecords}
            reportDetailViewNodeUsesWeight={reportDetailViewNodeUsesWeight}
            reportDetailBatchTotalWeightKg={reportDetailBatchTotalWeightKg}
            displayBatchTotalAmount={batch.totalAmount}
            displayBatchTotalWeightKg={reportDetailBatchTotalWeightKg}
          />
        </div>
        <div className="px-6 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReportPendingApprovalDetailModal);
