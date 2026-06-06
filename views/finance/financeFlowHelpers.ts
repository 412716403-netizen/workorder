import type { FinanceCategory, FinanceRecord, Product } from '../../types';

export type FinanceFlowRecordType = 'RECEIPT' | 'PAYMENT';

export const FINANCE_FLOW_LABELS: Record<FinanceFlowRecordType, string> = {
  RECEIPT: '收款流水',
  PAYMENT: '付款流水',
};

export const FINANCE_FLOW_PARTNER_LABEL: Record<FinanceFlowRecordType, string> = {
  RECEIPT: '缴款客户',
  PAYMENT: '收款单位/个人',
};

export interface FinanceFlowListFilters {
  docNo: string;
  partner: string;
  operator: string;
  categoryKeyword: string;
  productKeyword: string;
}

export function filterFinanceFlowRows(
  records: FinanceRecord[],
  filters: FinanceFlowListFilters,
  productMap?: Map<string, Product>,
  categoryMap?: Map<string, FinanceCategory>,
): FinanceRecord[] {
  const docQ = filters.docNo.trim().toLowerCase();
  const partnerQ = filters.partner.trim().toLowerCase();
  const operatorQ = filters.operator.trim().toLowerCase();
  const catQ = filters.categoryKeyword.trim().toLowerCase();
  const prodQ = filters.productKeyword.trim().toLowerCase();

  return records.filter(rec => {
    if (docQ) {
      const doc = (rec.docNo || rec.id || '').toLowerCase();
      if (!doc.includes(docQ)) return false;
    }
    if (partnerQ && !(rec.partner || '').toLowerCase().includes(partnerQ)) return false;
    if (operatorQ && !(rec.operator || '').toLowerCase().includes(operatorQ)) return false;
    if (catQ) {
      const catName = rec.categoryId
        ? (categoryMap?.get(rec.categoryId)?.name ?? '').toLowerCase()
        : '';
      if (!catName.includes(catQ)) return false;
    }
    if (prodQ) {
      const pid = rec.productId?.trim();
      if (!pid) return false;
      const p = productMap?.get(pid);
      const hay = `${p?.name ?? ''} ${p?.sku ?? ''} ${pid}`.toLowerCase();
      if (!hay.includes(prodQ)) return false;
    }
    return true;
  });
}

export function sumFinanceFlowTotals(records: FinanceRecord[]): {
  rowCount: number;
  totalAmount: number;
} {
  let totalAmount = 0;
  for (const rec of records) {
    const n = Number(rec.amount);
    if (Number.isFinite(n)) totalAmount += n;
  }
  return { rowCount: records.length, totalAmount };
}
