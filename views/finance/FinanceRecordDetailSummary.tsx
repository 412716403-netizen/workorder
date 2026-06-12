import React, { useMemo } from 'react';
import type { FinanceCategory, FinanceRecord, Product, ProductionOrder, Worker } from '../../types';
import { formatReportCustomDataForList } from '../../utils/reportCustomDocField';

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
  orders: ProductionOrder[];
  productMap: Map<string, Product>;
  workerMap: Map<string, Worker>;
}

function FinanceRecordDetailSummary({
  financeRec,
  current,
  financeCatMap,
  orders,
  productMap,
  workerMap,
}: FinanceRecordDetailSummaryProps) {
  const categoriesForType = useMemo(
    () => Array.from(financeCatMap.values()).filter(c => c.kind === financeRec.type),
    [financeCatMap, financeRec.type],
  );
  const selectedCategory = financeRec.categoryId ? financeCatMap.get(financeRec.categoryId) ?? null : null;

  const relatedOrderLabel = useMemo(() => {
    const relatedId = financeRec.relatedId?.trim();
    if (!relatedId) return '—';
    if (relatedId === 'General-Wages') return 'General-Wages - 通用生产补贴/奖金';
    const order = orders.find(o => o.orderNumber === relatedId);
    if (order) return `${order.orderNumber} - ${order.productName}`;
    return relatedId;
  }, [financeRec.relatedId, orders]);

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

  const amountClassName = financeRec.type === 'RECEIPT' ? 'text-emerald-600 font-black' : 'font-black';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
      {categoriesForType.length > 0 && (
        <DetailField label="单据分类" className="lg:col-span-2">
          {selectedCategory?.name ?? '—'}
        </DetailField>
      )}

      {selectedCategory ? (
        <>
          {selectedCategory.linkOrder && (
            <DetailField label="关联工单" className="lg:col-span-2">
              {relatedOrderLabel}
            </DetailField>
          )}
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
                const display = raw == null || raw === ''
                  ? '—'
                  : formatReportCustomDataForList(field, raw);
                return (
                  <DetailField key={field.id} label={field.label}>
                    {display || '—'}
                  </DetailField>
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
  );
}

export default React.memo(FinanceRecordDetailSummary);
