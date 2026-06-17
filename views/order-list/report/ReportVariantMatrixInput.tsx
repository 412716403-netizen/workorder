/**
 * 报工弹窗 - 矩阵模式 数量输入区 (Phase P4 抽离)。
 * 颜色 × 尺码矩阵,每个 cell 含良品/不良 双输入。
 */
import React from 'react';
import type {
  ProductionOrder,
  Product,
  ProductCategory,
  ProductMilestoneProgress,
  ProcessSequenceMode,
  ProductVariant,
  AppDictionaries,
} from '../../../types';
import { ScanBatchTrigger } from '../../../components/scan/ScanBatchTrigger';
import { productHasColorSizeMatrix } from '../../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../../utils/variantQtyMatrix';
import QtyMatrixTable, { type QtyMatrixTableRow } from '../../../components/variant-matrix/QtyMatrixTable';
import { variantMaxGoodProductMode } from '../../../utils/productReportAggregates';
import { reworkMergeBucketOrderId } from '../../../utils/reworkMergeBucketOrderId';
import { isProcessSequential } from '../../../shared/processSequence';
import {
  VARIANT_QTY_MATRIX_CONTAINER_ATTR,
  handleVariantQtyMatrixKeyDown,
} from '../../../utils/matrixKeyboardNav';
import type { ScanBatchRowDetail } from '../../../utils/scanBatchRowDetail';
import type { ScanPayload } from '../../../utils/scanPayload';
import type { ReportFormState, ReportModalData } from '../../../hooks/useReportModalState';
import type { ScanBatchApplyMeta } from '../../../components/scan/ScanBatchSessionModal';

export interface ScanWeightCheckProps {
  enableWeightCheck: boolean;
  weightNodeId?: string;
  weightTolerancePercent?: number;
  getUnitWeightKg?: (productId: string, variantId: string, nodeId: string) => number | undefined;
}

interface Props {
  reportModal: ReportModalData;
  reportForm: ReportFormState;
  ordersInModal: ProductionOrder[];
  orders: ProductionOrder[];
  productMap: Map<string, Product>;
  categoryMap: Map<string, ProductCategory>;
  productMilestoneProgresses: ProductMilestoneProgress[];
  productionLinkMode: 'order' | 'product';
  processSequenceMode: ProcessSequenceMode;
  outOfSequenceTemplateIds?: ReadonlySet<string>;
  dictionaries: AppDictionaries;
  matrixTotalQty: number;
  effectiveRemainingForModal: number;
  allowExceedMaxReportQty: boolean;
  outsourcedByVariantId: Record<string, number>;
  getDefectiveRework: (orderId: string, templateId: string) => { defective: number; rework: number; reworkByVariant: Record<string, number> };
  getSeqRemainingForVariant: (variantId: string) => number;
  onVariantQtyChange: (variantId: string, qty: number) => void;
  onVariantDefChange: (variantId: string, qty: number) => void;
  onScanBatchConfirm: (payloads: ScanPayload[], meta?: ScanBatchApplyMeta) => Promise<boolean>;
  resolveScanRowPreview: (payload: ScanPayload) => Promise<ScanBatchRowDetail | null>;
  scanWeightProps?: ScanWeightCheckProps;
  scanEnabled?: boolean;
}

const ReportVariantMatrixInput: React.FC<Props> = ({
  reportModal,
  reportForm,
  ordersInModal,
  orders,
  productMap,
  categoryMap,
  productMilestoneProgresses,
  productionLinkMode,
  processSequenceMode,
  outOfSequenceTemplateIds,
  dictionaries,
  matrixTotalQty,
  effectiveRemainingForModal,
  allowExceedMaxReportQty,
  outsourcedByVariantId,
  getDefectiveRework,
  getSeqRemainingForVariant,
  onVariantQtyChange,
  onVariantDefChange,
  onScanBatchConfirm,
  resolveScanRowPreview,
  scanWeightProps,
  scanEnabled = true,
}) => {
  const tid = reportModal.milestone.templateId;
  const product = productMap.get(reportModal.order.productId);
  const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
  if (!product || !productHasColorSizeMatrix(product, category) || !dictionaries) return null;

  const currentOrder = ordersInModal[0];
  const currentMs = currentOrder?.milestones.find(m => m.templateId === tid);
  const reworkByVariant: Record<string, number> = {};
  for (const bid of new Set(ordersInModal.map(o => reworkMergeBucketOrderId(o.id, orders)))) {
    const rw = getDefectiveRework(bid as string, tid).reworkByVariant;
    Object.entries(rw).forEach(([k, q]) => {
      reworkByVariant[k] = (reworkByVariant[k] ?? 0) + (q as number);
    });
  }
  const itemsSource = currentOrder?.items ?? reportModal.productItems ?? reportModal.order.items ?? [];
  const milestoneNodeIds = product.milestoneNodeIds || [];
  const variantRemainingBaseMap = new Map<string, number>();
  for (const variant of product.variants ?? []) {
    if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0) {
      const rawMax =
        variantMaxGoodProductMode(
          variant.id,
          tid,
          reportModal.order.productId,
          ordersInModal,
          productMilestoneProgresses,
          processSequenceMode,
          milestoneNodeIds,
          (oid, t) => getDefectiveRework(oid, t),
          orders,
          outOfSequenceTemplateIds,
        ) - (outsourcedByVariantId[variant.id] ?? 0);
      variantRemainingBaseMap.set(variant.id, Math.max(0, rawMax));
      continue;
    }
    const item = Array.isArray(itemsSource) ? itemsSource.find((i: { variantId?: string }) => (i.variantId || '') === variant.id) : undefined;
    const completedInMilestone = (currentMs?.reports || []).filter((r: { variantId?: string }) => (r.variantId || '') === variant.id).reduce((s: number, r: { quantity?: number }) => s + (r.quantity ?? 0), 0);
    const defectiveForThisVariant = (currentMs?.reports || []).filter((r: { variantId?: string; defectiveQuantity?: number }) => (r.variantId || '') === variant.id).reduce((s: number, r: { defectiveQuantity?: number }) => s + (r.defectiveQuantity ?? 0), 0);
    const base = isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds)
      ? Math.max(0, getSeqRemainingForVariant(variant.id) - defectiveForThisVariant)
      : (item ? Math.max(0, (item.quantity ?? 0) - completedInMilestone - defectiveForThisVariant) : 0);
    const reworkForVariant = reworkByVariant[variant.id] ?? 0;
    const outsourcedForVariant = outsourcedByVariantId[variant.id] ?? 0;
    variantRemainingBaseMap.set(variant.id, Math.max(0, base + reworkForVariant - outsourcedForVariant));
  }

  const renderVariantCellMatrix = (variant: ProductVariant, rowIndex: number, colIndex: number) => {
    const qty = reportForm.variantQuantities?.[variant.id] ?? 0;
    const remaining = Math.max(0, variantRemainingBaseMap.get(variant.id) ?? 0);
    const currentCellQty = reportForm.variantQuantities?.[variant.id] ?? 0;
    const otherTotal = matrixTotalQty - currentCellQty;
    const maxAllowed = Math.max(0, allowExceedMaxReportQty ? remaining : Math.min(remaining, effectiveRemainingForModal - otherTotal));
    return (
      <div key={variant.id} className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <input
            type="number"
            min={0}
            value={qty === 0 ? '' : qty}
            data-matrix-row={rowIndex}
            data-matrix-col={colIndex}
            onKeyDown={handleVariantQtyMatrixKeyDown}
            onChange={e => {
              const raw = parseInt(e.target.value) || 0;
              const next = allowExceedMaxReportQty ? raw : Math.min(raw, maxAllowed);
              onVariantQtyChange(variant.id, next);
            }}
            className="h-8 w-[3rem] shrink-0 rounded-md border border-slate-200 bg-white px-1.5 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[9px] placeholder:text-slate-400"
            placeholder="0"
            title={`良品，最多 ${maxAllowed}`}
          />
          <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-slate-400">最多 {maxAllowed}</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <input
            type="number"
            min={0}
            tabIndex={-1}
            value={(reportForm.variantDefectiveQuantities?.[variant.id] ?? 0) === 0 ? '' : (reportForm.variantDefectiveQuantities?.[variant.id] ?? 0)}
            onChange={e => onVariantDefChange(variant.id, parseInt(e.target.value) || 0)}
            className="h-8 w-[3rem] shrink-0 rounded-md border border-amber-200/90 bg-amber-50/90 px-1.5 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-[9px] placeholder:text-amber-400/80"
            placeholder="0"
            title="不良品"
          />
          <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-amber-800">不良品</span>
        </div>
      </div>
    );
  };

  const layout = buildVariantQtyMatrixLayout(product, dictionaries);
  if (!layout) return null;
  const rows: QtyMatrixTableRow[] = layout.colorRows.map((row, rowIndex) => {
    let rowSum = 0;
    const cells = row.variantAtSize.map((variant, si) => {
      if (!variant) return <span key={`${row.key}-e-${si}`} className="text-sm text-slate-300">—</span>;
      rowSum += reportForm.variantQuantities?.[variant.id] ?? 0;
      return renderVariantCellMatrix(variant, rowIndex, si);
    });
    return {
      key: row.key,
      colorCell: (
        <div className="flex items-center gap-2">
          {row.colorSwatch ? <span className="h-4 w-4 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: row.colorSwatch }} /> : null}
          <span>{row.colorLabel}</span>
        </div>
      ),
      cells,
      subtotalCell: rowSum,
    };
  });

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[10px] font-bold text-slate-400 uppercase shrink-0">本次完成数量（按规格）</label>
        <div className="flex items-center gap-2 shrink-0">
          {scanEnabled ? (
          <ScanBatchTrigger
            onApply={onScanBatchConfirm}
            resolveRowPreview={resolveScanRowPreview}
            size="sm"
            hint="扫码录入"
            modalTitle="报工 · 批量扫码"
            modalHint="请使用扫码枪；请先切换到英文（半角）输入法。扫入的码显示在列表中，确认后一次性累加到本次完成数量。"
            showScanIntentToggle
            enableWeightCheck={scanWeightProps?.enableWeightCheck}
            weightNodeId={scanWeightProps?.weightNodeId}
            weightTolerancePercent={scanWeightProps?.weightTolerancePercent}
            getUnitWeightKg={scanWeightProps?.getUnitWeightKg}
          />
          ) : null}
          <span className="text-xs sm:text-sm font-bold text-indigo-600 tabular-nums">合计 {matrixTotalQty} 件</span>
        </div>
      </div>
      <div className="rounded-xl bg-slate-50/50 p-2 sm:p-2.5 ring-1 ring-slate-100/80" {...{ [VARIANT_QTY_MATRIX_CONTAINER_ATTR]: '' }}>
        <QtyMatrixTable sizeHeaders={layout.sizeColumns.map(c => c.header)} rows={rows} dense />
      </div>
    </div>
  );
};

export default ReportVariantMatrixInput;
