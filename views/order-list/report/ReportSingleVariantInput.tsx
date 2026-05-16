/**
 * 报工弹窗 - 非矩阵模式 数量输入区 (Phase P4 抽离)。
 * 含规格下拉(多规格时) + 数量/不良/工价/预计金额/扫码累加。
 */
import React from 'react';
import type {
  Product,
  AppDictionaries,
} from '../../../types';
import { ScanBatchTrigger } from '../../../components/scan/ScanBatchTrigger';
import type { ScanBatchRowDetail } from '../../../utils/scanBatchRowDetail';
import type { ScanPayload } from '../../../utils/scanPayload';
import type { ReportFormState, ReportModalData } from '../../../hooks/useReportModalState';
import { formStandardLabelClass } from '../../../styles/uiDensity';

interface Props {
  reportModal: ReportModalData;
  reportForm: ReportFormState;
  setReportForm: React.Dispatch<React.SetStateAction<ReportFormState>>;
  productMap: Map<string, Product>;
  dictionaries: AppDictionaries;
  productionLinkMode: 'order' | 'product';
  effectiveRemainingForModal: number;
  allowExceedMaxReportQty: boolean;
  hintTotalQty: number;
  hintMaxReportable: number;
  hintCompletedDisplay: number;
  hintRemaining: number;
  totalOutsourcedAtNode: number;
  defectiveQtyForHint: number;
  totalRework: number;
  onScanBatchConfirm: (payloads: ScanPayload[]) => Promise<boolean>;
  resolveScanRowPreview: (payload: ScanPayload) => Promise<ScanBatchRowDetail | null>;
}

const ReportSingleVariantInput: React.FC<Props> = ({
  reportModal,
  reportForm,
  setReportForm,
  productMap,
  dictionaries,
  productionLinkMode,
  effectiveRemainingForModal,
  allowExceedMaxReportQty,
  hintTotalQty,
  hintMaxReportable,
  hintCompletedDisplay,
  hintRemaining,
  totalOutsourcedAtNode,
  defectiveQtyForHint,
  totalRework,
  onScanBatchConfirm,
  resolveScanRowPreview,
}) => {
  const reportProduct = productMap.get(reportModal.order.productId);
  const detailUnit = (reportProduct?.unitId && dictionaries.units.find(u => u.id === reportProduct.unitId)?.name) || '件';
  const nodeRate = reportProduct?.nodeRates?.[reportModal.milestone.templateId] ?? 0;
  const estAmount = reportForm.quantity > 0 && nodeRate > 0 ? reportForm.quantity * nodeRate : 0;
  const items = reportModal.productItems ?? reportModal.order.items;
  const showVariantSelect = items.length > 1;

  const renderHints = () => {
    if (hintTotalQty <= 0) return <span className="text-slate-500 text-[10px] sm:text-[11px]">工单 {reportModal.order.orderNumber}</span>;
    return (
      <span className="block mt-0.5">
        {hintMaxReportable !== hintTotalQty ? (
          <>可报 {hintMaxReportable}/{hintTotalQty} {detailUnit} · </>
        ) : (
          <>合计 {hintTotalQty} {detailUnit} · </>
        )}
        已报 {hintCompletedDisplay} · 剩 {hintRemaining} {detailUnit}
        {totalOutsourcedAtNode > 0 ? (
          <span className="text-slate-400" title="本工序已发外协、尚未收回的在制数量（外协剩余）">
            {' '}· 外协剩余 {totalOutsourcedAtNode} {detailUnit}
          </span>
        ) : null}
        {defectiveQtyForHint > 0 ? (
          <span className="text-slate-400" title="本工序报不良等需走返工流程的件数">
            {' '}· 返工 {defectiveQtyForHint} {detailUnit}
          </span>
        ) : null}
        {totalRework > 0 ? (
          <span className="text-slate-400" title="返工报工已回缴到本工序的完成件数">
            {' '}·{defectiveQtyForHint > 0 ? ' 返工完成' : ' 返工'} {totalRework}
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/40 px-4 pb-4 pt-4 space-y-3">
      {showVariantSelect && (
        <div className="space-y-1">
          <label className={formStandardLabelClass}>报工规格项</label>
          <select
            tabIndex={-1}
            value={reportForm.variantId}
            onChange={e => setReportForm({ ...reportForm, variantId: e.target.value })}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none"
          >
            <option value="">请选择报工规格...</option>
            {items.map((item, idx) => {
              const product = productMap.get(reportModal.order.productId);
              const v = product?.variants?.find((x: { id: string }) => x.id === item.variantId);
              const completedInMilestone = reportModal.productItems
                ? (item.completedQuantity ?? 0)
                : (reportModal.milestone.reports || []).filter(r => (r.variantId || '') === (item.variantId || '')).reduce((s, r) => s + r.quantity, 0);
              const remaining = item.quantity - completedInMilestone;
              return (
                <option key={item.variantId ?? idx} value={item.variantId || ''}>
                  {(v as { skuSuffix?: string })?.skuSuffix || item.variantId || `规格${idx + 1}`} (剩余: {remaining})
                </option>
              );
            })}
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 sm:gap-x-5">
        <div className="flex min-w-0 w-full flex-1 flex-col gap-0.5 sm:w-auto sm:max-w-[min(100%,24rem)]">
          {productionLinkMode === 'product' ? (
            <>
              <span className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{reportModal.order.productName}</span>
              <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-snug">
                {renderHints()}
              </div>
            </>
          ) : (
            <div className="flex min-w-0 w-full flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-bold text-slate-900">{reportModal.order.orderNumber}</span>
                <span className="text-sm text-slate-400">·</span>
                <span className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{reportModal.order.productName}</span>
              </div>
              {hintTotalQty > 0 ? (
                <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-snug">{renderHints()}</div>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex flex-col shrink-0 sm:pl-1">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <input
                type="number"
                min={0}
                value={reportForm.quantity === 0 ? '' : reportForm.quantity}
                onChange={e => {
                  const raw = parseInt(e.target.value) || 0;
                  const next = allowExceedMaxReportQty ? raw : Math.min(raw, effectiveRemainingForModal);
                  setReportForm({ ...reportForm, quantity: next });
                }}
                placeholder="0"
                title={`最多 ${effectiveRemainingForModal}`}
                className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[9px] placeholder:text-slate-400 tabular-nums"
              />
              <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-slate-400">最多 {effectiveRemainingForModal}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <input
                type="number"
                min={0}
                tabIndex={-1}
                value={reportForm.defectiveQuantity === 0 ? '' : reportForm.defectiveQuantity}
                onChange={e => setReportForm({ ...reportForm, defectiveQuantity: parseInt(e.target.value) || 0 })}
                className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-amber-200/90 bg-amber-50/90 px-2 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-[9px] placeholder:text-amber-400/80 tabular-nums"
                placeholder="0"
                title="不良品"
              />
              <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-amber-800">不良品</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-end gap-2 sm:gap-3">
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-black text-slate-400 uppercase whitespace-nowrap tracking-wide">工价</label>
            <div className="h-8 w-[5.25rem] box-border rounded-lg border border-slate-100 bg-white px-1.5 text-xs font-bold text-slate-700 flex items-center justify-center tabular-nums">
              {nodeRate > 0 ? `${nodeRate.toFixed(2)} 元/${detailUnit}` : '—'}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-black text-slate-400 uppercase whitespace-nowrap tracking-wide">预计金额</label>
            <div className="h-8 min-w-[4.75rem] max-w-[5.5rem] box-border rounded-lg border border-slate-100 bg-white px-1 text-xs font-bold text-slate-700 flex items-center justify-center tabular-nums">
              {reportForm.quantity > 0 && nodeRate > 0 ? estAmount.toFixed(2) : '—'}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 shrink-0 sm:pl-1">
          <label className="text-[9px] font-black text-slate-400 uppercase whitespace-nowrap tracking-wide">扫码累加</label>
          <div className="h-8 flex items-center">
            <ScanBatchTrigger
              onApply={onScanBatchConfirm}
              resolveRowPreview={resolveScanRowPreview}
              hint="扫码录入"
              modalTitle="报工 · 批量扫码"
              modalHint="请使用扫码枪；请先切换到英文（半角）输入法。扫入的码显示在列表中，确认后一次性累加到本次完成数量。"
              showScanIntentToggle
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportSingleVariantInput;
