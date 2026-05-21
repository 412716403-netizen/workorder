import type { FinanceRecord, ProductionOpRecord } from '../types';

import { isPurchaseBillDocType } from '../shared/types';

/** 合作单位对账：统一展示行（采购入库/销售单/外协收回/收款单/付款单） */
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
    if (isPurchaseBillDocType(row.docType)) dec = Math.abs(row.amount);
    else if (row.docType === '外协收回') dec = Math.abs(row.amount);
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
