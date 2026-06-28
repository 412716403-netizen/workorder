import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { FinanceCategory, FinanceRecord, PlanFormFieldConfig, Product, ReportFieldDefinition, Worker } from '../../types';
import { normalizeReportFieldDefinition } from '../../utils/reportCustomDocField';
import { PlanFormCustomFieldReadonly } from '../../components/PlanFormCustomFieldControls';

function reportFieldToPlanFormField(field: ReportFieldDefinition): PlanFormFieldConfig {
  const f = normalizeReportFieldDefinition(field);
  return {
    id: f.id,
    label: f.label,
    type: f.type,
    options: f.options,
    dateWithTime: f.dateWithTime,
    dateAutoFill: f.dateAutoFill,
    showInList: false,
    showInCreate: true,
    showInDetail: true,
  };
}

function DetailField({
  label,
  children,
  valueClassName,
  className,
}: {
  label: string;
  children: React.ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      <p className={`text-sm font-bold text-slate-800 mt-0.5 whitespace-pre-wrap ${valueClassName ?? ''}`}>{children}</p>
    </div>
  );
}

export interface FinanceRecordDetailSummaryProps {
  financeRec: FinanceRecord;
  current: { partnerLabel: string; label?: string };
  financeCatMap: Map<string, FinanceCategory>;
  productMap: Map<string, Product>;
  workerMap: Map<string, Worker>;
}

function FinanceRecordDetailSummary({
  financeRec,
  current,
  financeCatMap,
  productMap,
  workerMap,
}: FinanceRecordDetailSummaryProps) {
  const categoriesForType = useMemo(
    () => Array.from(financeCatMap.values()).filter(c => c.kind === financeRec.type),
    [financeCatMap, financeRec.type],
  );
  const selectedCategory = financeRec.categoryId ? financeCatMap.get(financeRec.categoryId) ?? null : null;

  const productLabel = useMemo(() => {
    const pid = financeRec.productId?.trim();
    if (!pid) return '—';
    return productMap.get(pid)?.name ?? pid;
  }, [financeRec.productId, productMap]);

  const workerLabel = useMemo(() => {
    const wid = financeRec.workerId?.trim();
    if (!wid) return '—';
    return workerMap.get(wid)?.name ?? wid;
  }, [financeRec.workerId, workerMap]);

  const customFields = useMemo(
    () => (selectedCategory?.customFields ?? []).filter(f => f.showInForm !== false),
    [selectedCategory],
  );

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!previewSrc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewSrc(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [previewSrc]);

  const amountClassName = financeRec.type === 'RECEIPT' ? 'text-emerald-600 font-black' : 'font-black';

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
      {categoriesForType.length > 0 && (
        <DetailField label="单据分类" className="lg:col-span-2">
          {selectedCategory?.name ?? '—'}
        </DetailField>
      )}

      {selectedCategory ? (
        <>
          {selectedCategory.linkPartner && (
            <DetailField label={current.partnerLabel}>
              {financeRec.partner?.trim() || '—'}
            </DetailField>
          )}
          {selectedCategory.selectPaymentAccount && (
            <DetailField label="收支账户">
              {financeRec.paymentAccount?.trim() || '—'}
            </DetailField>
          )}
          {selectedCategory.linkWorker && (
            <DetailField label="关联工人">
              {workerLabel}
            </DetailField>
          )}
          {selectedCategory.linkProduct && (
            <DetailField label="关联产品">
              {productLabel}
            </DetailField>
          )}
          {customFields.length > 0 && (
            <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
              {customFields.map(field => {
                const raw = financeRec.customData?.[field.id];
                return (
                  <div key={field.id}>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{field.label}</span>
                    <div className="mt-0.5">
                      <PlanFormCustomFieldReadonly
                        cf={reportFieldToPlanFormField(field)}
                        value={raw}
                        onFilePreview={(url, fileType) => {
                          if (fileType === 'image') setPreviewSrc(url);
                          else window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <DetailField label={current.partnerLabel} className="lg:col-span-2">
          {financeRec.partner?.trim() || '—'}
        </DetailField>
      )}

      <DetailField label="结算金额 (CNY)" valueClassName={amountClassName}>
        ¥ {financeRec.amount.toLocaleString()}
      </DetailField>
      <DetailField label="备注说明">
        {financeRec.note?.trim() ? financeRec.note : '—'}
      </DetailField>
    </div>
    {previewSrc && typeof document !== 'undefined' &&
      createPortal(
        <div
          className="fixed inset-0 z-[10200] flex items-center justify-center bg-slate-900/85 p-6 animate-in fade-in duration-150"
          onClick={() => setPreviewSrc(null)}
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
        >
          <button
            type="button"
            onClick={() => setPreviewSrc(null)}
            aria-label="关闭"
            className="absolute right-4 top-4 inline-flex items-center justify-center rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={previewSrc}
            alt="图片预览"
            className="max-h-[90vh] max-w-[min(96vw,1200px)] rounded-lg object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

export default React.memo(FinanceRecordDetailSummary);
