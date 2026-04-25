import type { FinanceRecord } from '../../types';
import type { PartnerReconRow, SettlementReconRow } from '../../hooks/useFinanceReconciliation';

export type DetailTarget = FinanceRecord | PartnerReconRow | SettlementReconRow;

export function isPartnerReconRow(x: DetailTarget): x is PartnerReconRow {
  return 'source' in x && (x.source === 'finance' || x.source === 'psi' || x.source === 'prod');
}

export function isSettlementReconRow(x: DetailTarget): x is SettlementReconRow {
  return 'source' in x && (x.source === 'work_report' || x.source === 'rework_report' || x.source === 'settlement_finance');
}

export function getFinanceRecordFromDetail(d: DetailTarget): FinanceRecord | null {
  if (isPartnerReconRow(d)) return d.source === 'finance' ? d.rec : null;
  if (isSettlementReconRow(d) && d.source === 'settlement_finance') return d.rec;
  if (typeof d === 'object' && d !== null && 'type' in d && ['RECEIPT', 'PAYMENT', 'RECONCILIATION', 'SETTLEMENT'].includes((d as FinanceRecord).type)) return d as FinanceRecord;
  return null;
}
