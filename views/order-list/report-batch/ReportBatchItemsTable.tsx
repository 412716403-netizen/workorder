/**
 * 报工批次详情 - 详情视图明细表 (Phase P3 抽离自 ReportBatchDetailModal.tsx)。
 *
 * 包含两个分支:
 * - matrix=true: 颜色 × 尺码矩阵展示 (与报工弹窗一致)
 * - matrix=false: 普通行明细
 *
 * 仅渲染,不持有任何 state;所有派生数据由父组件 useMemo 后传入。
 */
import React from 'react';
import { Clock, User, Package } from 'lucide-react';
import type {
  Product,
  ProductCategory,
  ProductVariant,
  GlobalNodeTemplate,
  AppDictionaries,
  ProductMilestoneProgress,
  ProductionOrder,
} from '../../../types';
import { DocInlineMetaRow, DocSummaryCard } from '../../../components/doc-modal';
import { fmtDT } from '../../../utils/formatTime';
import { getEffectiveReportTemplate, getReportCustomDataDisplayEntries } from '../../../utils/effectiveReportTemplate';
import { getProductCategoryCustomFieldEntries } from '../../../utils/reportCustomDocField';
import QtyMatrixTable, { type QtyMatrixTableRow } from '../../../components/variant-matrix/QtyMatrixTable';
import { buildVariantQtyMatrixLayout } from '../../../utils/variantQtyMatrix';
import {
  isOutsourceReceiveReport,
  resolveReportDisplayEconomics,
} from '../../../utils/outsourceReceiveReportDisplay';
import { AMOUNT_PERMISSION_KEYS, useCanViewAmount } from '../../../utils/canViewAmount';
import { formatWeightKgDisplay } from '../../../utils/reportBatchWeightHelpers';
import type { ProductionOpRecord } from '../../../types';

type OrderReportRow = {
  order: ProductionOrder;
  milestone: { id: string; name: string; templateId: string };
  report: {
    id: string; timestamp: string; operator: string; quantity: number;
    defectiveQuantity?: number; variantId?: string; reportBatchId?: string; reportNo?: string;
    rate?: number;
    weight?: unknown;
    customData?: Record<string, unknown>;
    [k: string]: unknown;
  };
};
type ProductReportRow = { progress: ProductMilestoneProgress; report: OrderReportRow['report'] };

type ReportDetailBatch =
  | { source: 'order'; key: string; rows: OrderReportRow[]; first: OrderReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string }
  | { source: 'product'; key: string; progressId: string; productId: string; productName: string; milestoneName: string; milestoneTemplateId: string; rows: ProductReportRow[]; first: ProductReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string };

export type BatchDetailMatrix = {
  product: Product;
  layout: NonNullable<ReturnType<typeof buildVariantQtyMatrixLayout>>;
  variantToReportId: Map<string, string>;
  goodByVariant: Record<string, number>;
  defectiveByVariant: Record<string, number>;
};

interface Props {
  batch: ReportDetailBatch;
  batchDetailMatrix: BatchDetailMatrix | null;
  products: Product[];
  categoryMap: Map<string, ProductCategory>;
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  prodRecords: ProductionOpRecord[];
  reportDetailViewNodeUsesWeight: boolean;
  reportDetailBatchTotalWeightKg: number;
  displayBatchTotalAmount: number;
  displayBatchTotalWeightKg: number;
}

const ReportBatchItemsTable: React.FC<Props> = ({
  batch,
  batchDetailMatrix,
  products,
  categoryMap,
  dictionaries,
  globalNodes,
  prodRecords,
  reportDetailViewNodeUsesWeight,
  reportDetailBatchTotalWeightKg,
  displayBatchTotalAmount,
  displayBatchTotalWeightKg,
}) => {
  const batchIsOutsourceReceive = isOutsourceReceiveReport(batch.first.report);
  const showOutsourceAmount = useCanViewAmount(AMOUNT_PERMISSION_KEYS.OUTSOURCE);
  const showEconomics = !batchIsOutsourceReceive || showOutsourceAmount;
  const productId = batch.source === 'order' ? batch.first.order.productId : batch.productId;
  const p = products.find(px => px.id === productId);
  const unitName = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
  const milestoneName = batch.source === 'order' ? batch.first.milestone.name : batch.milestoneName;
  const tid = batch.source === 'order' ? batch.first.milestone.templateId : batch.milestoneTemplateId;
  const ms = batch.source === 'order' ? batch.first.order.milestones?.find(m => m.templateId === tid) : undefined;
  const tmpl = getEffectiveReportTemplate(ms ?? { templateId: tid, reportTemplate: [] }, globalNodes);
  const cd = batch.first.report?.customData;
  const entries = getReportCustomDataDisplayEntries(cd, tmpl);
  const orderNo = batch.source === 'order' ? batch.first.order.orderNumber : null;
  const batchNoLabel = batch.reportNo?.trim() || null;

  return (
    <>
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
              {batch.first.report.timestamp ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="normal-case">添加 {fmtDT(batch.first.report.timestamp)}</span>
                </span>
              ) : null}
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="normal-case">经办: {batch.first.report.operator || '—'}</span>
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
                {batch.totalGood.toLocaleString()} {unitName}
              </p>
            </div>
            {showEconomics && displayBatchTotalAmount > 0 ? (
              <div className="min-w-[6.5rem] md:text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">本批金额</p>
                <p className="font-black tabular-nums text-emerald-600">¥{displayBatchTotalAmount.toFixed(2)}</p>
              </div>
            ) : null}
            {reportDetailViewNodeUsesWeight && displayBatchTotalWeightKg > 0 ? (
              <div className="min-w-[6.5rem] md:text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">本批重量</p>
                <p className="font-black tabular-nums text-slate-800">
                  {formatWeightKgDisplay(displayBatchTotalWeightKg)} kg
                </p>
              </div>
            ) : null}
          </>
        }
      />
      <div className="flex-1 overflow-auto pb-4 -mt-1">
        {batchDetailMatrix ? (
          <MatrixView
            batch={batch}
            matrix={batchDetailMatrix}
            categoryMap={categoryMap}
            dictionaries={dictionaries}
            products={products}
            prodRecords={prodRecords}
            batchIsOutsourceReceive={batchIsOutsourceReceive}
            reportDetailViewNodeUsesWeight={reportDetailViewNodeUsesWeight}
            displayBatchTotalAmount={displayBatchTotalAmount}
            displayBatchTotalWeightKg={displayBatchTotalWeightKg}
            showEconomics={showEconomics}
          />
        ) : (
          <FlatView
            batch={batch}
            products={products}
            dictionaries={dictionaries}
            prodRecords={prodRecords}
            reportDetailViewNodeUsesWeight={reportDetailViewNodeUsesWeight}
            showEconomics={showEconomics}
          />
        )}
      </div>
    </>
  );
};

interface MatrixViewProps {
  batch: ReportDetailBatch;
  matrix: BatchDetailMatrix;
  categoryMap: Map<string, ProductCategory>;
  dictionaries: AppDictionaries;
  products: Product[];
  prodRecords: ProductionOpRecord[];
  batchIsOutsourceReceive: boolean;
  reportDetailViewNodeUsesWeight: boolean;
  displayBatchTotalAmount: number;
  displayBatchTotalWeightKg: number;
  showEconomics?: boolean;
}

const MatrixView: React.FC<MatrixViewProps> = ({
  batch,
  matrix,
  categoryMap,
  dictionaries,
  products,
  prodRecords,
  batchIsOutsourceReceive,
  reportDetailViewNodeUsesWeight,
  displayBatchTotalAmount,
  displayBatchTotalWeightKg,
  showEconomics = true,
}) => {
  const { layout, goodByVariant, defectiveByVariant, variantToReportId, product: viewMatrixProduct } = matrix;
  const viewMatrixUnit = (viewMatrixProduct.unitId && dictionaries.units.find(u => u.id === viewMatrixProduct.unitId)?.name) || '件';
  const viewMatrixCustomTags = getProductCategoryCustomFieldEntries(
    viewMatrixProduct,
    viewMatrixProduct.categoryId ? categoryMap.get(viewMatrixProduct.categoryId) ?? null : null,
    { includeFile: false, includeEmpty: false },
  );
  const viewMatrixColSpan = 2 + (showEconomics ? 2 : 0) + (reportDetailViewNodeUsesWeight ? 1 : 0);
  const viewMatrixRate = (() => {
    if (batchIsOutsourceReceive && batch.totalGood > 0 && displayBatchTotalAmount > 0) {
      return displayBatchTotalAmount / batch.totalGood;
    }
    if (batch.source === 'order') {
      const r0 = batch.rows[0] as OrderReportRow;
      const p0 = products.find(px => px.id === r0.order.productId);
      const eco = resolveReportDisplayEconomics(r0.report, prodRecords, {
        nodeId: r0.milestone.templateId,
        productId: r0.order.productId,
        orderId: r0.order.id,
        fallbackRate: p0?.nodeRates?.[r0.milestone.templateId],
      });
      return eco.rate;
    }
    const r0 = batch.rows[0] as ProductReportRow;
    const p0 = products.find(px => px.id === r0.progress.productId);
    return resolveReportDisplayEconomics(r0.report, prodRecords, {
      nodeId: r0.progress.milestoneTemplateId,
      productId: r0.progress.productId,
      orderId: null,
      fallbackRate: p0?.nodeRates?.[r0.progress.milestoneTemplateId],
    }).rate;
  })();

  const productThumbView = viewMatrixProduct.imageUrl ? (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
      <img src={viewMatrixProduct.imageUrl} alt={viewMatrixProduct.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
    </div>
  ) : (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
      <Package className="h-4 w-4" />
    </div>
  );

  const rows: QtyMatrixTableRow[] = layout.colorRows.map(row => {
    let rowSum = 0;
    const cells = row.variantAtSize.map((variant: ProductVariant | null, si: number) => {
      if (!variant) return <span key={`${row.key}-e-${si}`} className="text-sm text-slate-300">—</span>;
      if (!variantToReportId.has(variant.id)) return <span key={variant.id} className="text-sm text-slate-300">—</span>;
      const g = goodByVariant[variant.id] ?? 0;
      const d = defectiveByVariant[variant.id] ?? 0;
      rowSum += g;
      return (
        <div key={variant.id} className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-bold text-emerald-600 tabular-nums">{g}</span>
          {d > 0 ? <span className="text-[10px] font-medium tabular-nums text-amber-700">不良 {d}</span> : null}
        </div>
      );
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
    <div className="space-y-2">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细（按规格）</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
              <th className="py-2.5 px-3 text-left">产品 / SKU</th>
              <th className="py-2.5 px-3 text-right">数量</th>
              {showEconomics && <th className="py-2.5 px-3 text-right">工价</th>}
              {showEconomics && <th className="py-2.5 px-3 text-right">金额(元)</th>}
              {reportDetailViewNodeUsesWeight ? <th className="py-2.5 px-3 text-right whitespace-nowrap">重量 (kg)</th> : null}
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
                        <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{viewMatrixProduct.sku}</span>
                      ) : null}
                    </div>
                    {viewMatrixCustomTags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {viewMatrixCustomTags.map(({ field, display }) => (
                          <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
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
                  {batch.totalGood.toLocaleString()} {viewMatrixUnit}
                </span>
                {batch.totalDefective > 0 ? (
                  <span className="mt-0.5 block text-[10px] font-medium text-amber-700 tabular-nums">
                    不良 {batch.totalDefective} {viewMatrixUnit}
                  </span>
                ) : null}
              </td>
              {showEconomics && (
              <td className="py-2.5 px-3 text-right align-middle text-xs text-slate-600">
                {viewMatrixRate > 0 ? `${viewMatrixRate.toFixed(2)} 元/${viewMatrixUnit}` : '—'}
              </td>
              )}
              {showEconomics && (
              <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-indigo-600 tabular-nums">
                {displayBatchTotalAmount > 0 ? displayBatchTotalAmount.toFixed(2) : '—'}
              </td>
              )}
              {reportDetailViewNodeUsesWeight ? (
                <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                  {formatWeightKgDisplay(displayBatchTotalWeightKg)}
                </td>
              ) : null}
            </tr>
            <tr className="bg-slate-50/70">
              <td colSpan={viewMatrixColSpan} className="border-t border-slate-100 px-3 pb-3 pt-2 align-top">
                <QtyMatrixTable sizeHeaders={layout.sizeColumns.map(c => c.header)} rows={rows} dense />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface FlatViewProps {
  batch: ReportDetailBatch;
  products: Product[];
  dictionaries: AppDictionaries;
  prodRecords: ProductionOpRecord[];
  reportDetailViewNodeUsesWeight: boolean;
  showEconomics?: boolean;
}

const FlatView: React.FC<FlatViewProps> = ({ batch, products, dictionaries, prodRecords, reportDetailViewNodeUsesWeight, showEconomics = true }) => (
  <div className="space-y-2">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细</p>
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-2 sm:p-3 space-y-2">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">产品</th>
              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-left">数量</th>
              {showEconomics && <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">工价</th>}
              {showEconomics && <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">金额(元)</th>}
              {reportDetailViewNodeUsesWeight ? (
                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">重量 (kg)</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {batch.source === 'order'
              ? batch.rows.map(({ order, milestone, report }) => {
                  const p = products.find(px => px.id === order.productId);
                  const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                  const { rate, amount, weight } = resolveReportDisplayEconomics(report, prodRecords, {
                    nodeId: milestone.templateId,
                    productId: order.productId,
                    orderId: order.id,
                    fallbackRate: p?.nodeRates?.[milestone.templateId],
                  });
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
                          {def > 0 ? <span className="text-[10px] font-medium tabular-nums text-amber-800">不良 {def} {detailUnit}</span> : null}
                        </div>
                      </td>
                      {showEconomics && (
                      <td className="px-3 py-2.5 sm:px-4 align-middle text-slate-600 text-right text-xs">
                        {rate > 0 ? `${rate.toFixed(2)} 元/${detailUnit}` : '—'}
                      </td>
                      )}
                      {showEconomics && (
                      <td className="px-3 py-2.5 sm:px-4 align-middle text-sm font-bold text-indigo-600 text-right tabular-nums">
                        {amount > 0 ? amount.toFixed(2) : '—'}
                      </td>
                      )}
                      {reportDetailViewNodeUsesWeight ? (
                        <td className="px-3 py-2.5 sm:px-4 align-middle text-right text-xs font-bold tabular-nums text-slate-700">
                          {formatWeightKgDisplay(weight)}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              : batch.rows.map(({ progress, report }) => {
                  const p = products.find(px => px.id === progress.productId);
                  const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                  const { rate, amount, weight } = resolveReportDisplayEconomics(report, prodRecords, {
                    nodeId: progress.milestoneTemplateId,
                    productId: progress.productId,
                    orderId: null,
                    fallbackRate: p?.nodeRates?.[progress.milestoneTemplateId],
                  });
                  const def = report.defectiveQuantity ?? 0;
                  return (
                    <tr key={report.id} className="border-b border-slate-100">
                      <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[11rem] sm:max-w-[14rem]">
                        <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={batch.productName}>
                          {batch.productName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 align-middle">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-bold text-emerald-600 tabular-nums">
                            {report.quantity} {detailUnit}
                          </span>
                          {def > 0 ? <span className="text-[10px] font-medium tabular-nums text-amber-800">不良 {def} {detailUnit}</span> : null}
                        </div>
                      </td>
                      {showEconomics && (
                      <td className="px-3 py-2.5 sm:px-4 align-middle text-slate-600 text-right text-xs">
                        {rate > 0 ? `${rate.toFixed(2)} 元/${detailUnit}` : '—'}
                      </td>
                      )}
                      {showEconomics && (
                      <td className="px-3 py-2.5 sm:px-4 align-middle text-sm font-bold text-indigo-600 text-right tabular-nums">
                        {amount > 0 ? amount.toFixed(2) : '—'}
                      </td>
                      )}
                      {reportDetailViewNodeUsesWeight ? (
                        <td className="px-3 py-2.5 sm:px-4 align-middle text-right text-xs font-bold tabular-nums text-slate-700">
                          {formatWeightKgDisplay(weight)}
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
);

export default ReportBatchItemsTable;
