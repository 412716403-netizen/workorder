import type { FinanceRecord, ProductionOpRecord } from '../types';

import { isPurchaseBillDocType } from '../shared/types';

/** 合作单位对账：外协/返工收回单据类型展示名 */
export const PARTNER_RECON_DOC_OUTSOURCE_RECEIVE = '外协收回' as const;
export const PARTNER_RECON_DOC_REWORK_RECEIVE = '返工收回' as const;

export function isPartnerReconOutsourceReceiveDocType(docType: string): boolean {
  return docType === PARTNER_RECON_DOC_OUTSOURCE_RECEIVE || docType === PARTNER_RECON_DOC_REWORK_RECEIVE;
}

/** 按单据行是否关联返工（sourceReworkId）区分外协收回与返工收回 */
export function partnerReconOutsourceReceiveDocType(hasReworkSource: boolean): string {
  return hasReworkSource ? PARTNER_RECON_DOC_REWORK_RECEIVE : PARTNER_RECON_DOC_OUTSOURCE_RECEIVE;
}

/** 生产外协收回行是否匹配对账单据类型 */
export function outsourceReceiveRecordMatchesReconDocType(
  rec: ProductionOpRecord,
  docType: string,
): boolean {
  if (rec.type !== 'OUTSOURCE' || rec.status !== '已收回') return false;
  if (docType === PARTNER_RECON_DOC_REWORK_RECEIVE) return !!rec.sourceReworkId;
  if (docType === PARTNER_RECON_DOC_OUTSOURCE_RECEIVE) return !rec.sourceReworkId;
  return false;
}

/** 合作单位对账：统一展示行（采购入库/销售单/外协收回/返工收回/收款单/付款单） */
export type PartnerReconRow =
  | { source: 'finance'; rec: FinanceRecord }
  | { source: 'psi'; docType: string; docNo: string; timestamp: string; partner: string; amount: number; operator?: string; note?: string }
  | { source: 'prod'; rec: ProductionOpRecord };

export type PartnerReconBalancedRow = {
  row: PartnerReconRow;
  receivableInc: number;
  receivableDec: number;
  balance: number;
};

export type PartnerReconSummary = {
  openingBalance: number;
  periodInc: number;
  periodDec: number;
  closingBalance: number;
};

/** 与财务对账列表应收增减规则一致 */
export function computePartnerReconRowDelta(row: PartnerReconRow): { inc: number; dec: number } {
  let inc = 0;
  let dec = 0;
  if (row.source === 'finance') {
    if (row.rec.type === 'RECEIPT') dec = row.rec.amount;
    else if (row.rec.type === 'PAYMENT') inc = row.rec.amount;
  } else if (row.source === 'psi') {
    if (isPurchaseBillDocType(row.docType) || row.docType === '采购退货') {
      if (row.amount >= 0) dec = Math.abs(row.amount);
      else inc = Math.abs(row.amount);
    } else if (isPartnerReconOutsourceReceiveDocType(row.docType)) dec = Math.abs(row.amount);
    else if (row.docType === '销售单') {
      if (row.amount >= 0) inc = row.amount;
      else dec = Math.abs(row.amount);
    }
  } else if (row.source === 'prod') {
    dec = Number(row.rec.amount) || 0;
  }
  return { inc, dec };
}

export function buildPartnerReconBalances(
  rows: PartnerReconRow[],
  openingBalance = 0,
): PartnerReconBalancedRow[] {
  let running = openingBalance;
  return rows.map(row => {
    const { inc, dec } = computePartnerReconRowDelta(row);
    running += inc - dec;
    return { row, receivableInc: inc, receivableDec: dec, balance: running };
  });
}

export function summarizePartnerReconBalances(
  rows: PartnerReconRow[],
  openingBalance = 0,
): PartnerReconSummary {
  let periodInc = 0;
  let periodDec = 0;
  for (const row of rows) {
    const { inc, dec } = computePartnerReconRowDelta(row);
    periodInc += inc;
    periodDec += dec;
  }
  return {
    openingBalance,
    periodInc,
    periodDec,
    closingBalance: openingBalance + periodInc - periodDec,
  };
}
