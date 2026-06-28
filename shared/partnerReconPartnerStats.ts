/** 合作单位对账口径下的应收增减（与 `utils/partnerReconLedger.ts` 一致） */
export type PartnerReconDelta = { inc: number; dec: number };

export function computePartnerReconPsiDocDelta(type: string, amount: number): PartnerReconDelta {
  if (type === 'PURCHASE_BILL') {
    if (amount >= 0) return { inc: 0, dec: Math.abs(amount) };
    return { inc: Math.abs(amount), dec: 0 };
  }
  if (type === 'SALES_BILL') {
    if (amount >= 0) return { inc: amount, dec: 0 };
    return { inc: 0, dec: Math.abs(amount) };
  }
  return { inc: 0, dec: 0 };
}

export function computePartnerReconFinanceDocDelta(type: string, amount: number): PartnerReconDelta {
  if (type === 'RECEIPT') return { inc: 0, dec: Math.abs(amount) };
  if (type === 'PAYMENT') return { inc: Math.abs(amount), dec: 0 };
  return { inc: 0, dec: 0 };
}

export function computePartnerReconOutsourceReceiveDelta(amount: number): PartnerReconDelta {
  return { inc: 0, dec: Math.abs(amount) };
}

export type PartnerLedgerBucket = {
  openingInc: number;
  openingDec: number;
  periodInc: number;
  periodDec: number;
};

export function emptyPartnerLedgerBucket(): PartnerLedgerBucket {
  return { openingInc: 0, openingDec: 0, periodInc: 0, periodDec: 0 };
}

export function applyPartnerLedgerDelta(
  bucket: PartnerLedgerBucket,
  delta: PartnerReconDelta,
  inPeriod: boolean,
): void {
  if (inPeriod) {
    bucket.periodInc += delta.inc;
    bucket.periodDec += delta.dec;
  } else {
    bucket.openingInc += delta.inc;
    bucket.openingDec += delta.dec;
  }
}

export type PartnerReconPartnerStatsSlice = {
  partner: string;
  amount: number;
};

export type PartnerReconPartnerStatsSummary = {
  /** 本期累计增加（应收侧） */
  periodReceivable: number;
  /** 本期累计减少（应付侧） */
  periodPayable: number;
  /** 期末正余额合计（仍应收） */
  remainingReceivable: number;
  /** 期末负余额绝对值合计（仍应付） */
  remainingPayable: number;
};

export type PartnerReconPartnerStatsResult = {
  summary: PartnerReconPartnerStatsSummary;
  periodReceivableByPartner: PartnerReconPartnerStatsSlice[];
  periodPayableByPartner: PartnerReconPartnerStatsSlice[];
  remainingReceivableByPartner: PartnerReconPartnerStatsSlice[];
  remainingPayableByPartner: PartnerReconPartnerStatsSlice[];
};

export function summarizePartnerLedgerBuckets(
  buckets: Map<string, PartnerLedgerBucket>,
): PartnerReconPartnerStatsResult {
  const summary: PartnerReconPartnerStatsSummary = {
    periodReceivable: 0,
    periodPayable: 0,
    remainingReceivable: 0,
    remainingPayable: 0,
  };
  const periodReceivableByPartner: PartnerReconPartnerStatsSlice[] = [];
  const periodPayableByPartner: PartnerReconPartnerStatsSlice[] = [];
  const remainingReceivableByPartner: PartnerReconPartnerStatsSlice[] = [];
  const remainingPayableByPartner: PartnerReconPartnerStatsSlice[] = [];

  for (const [partner, bucket] of buckets) {
    const opening = bucket.openingInc - bucket.openingDec;
    const closing = opening + bucket.periodInc - bucket.periodDec;
    summary.periodReceivable += bucket.periodInc;
    summary.periodPayable += bucket.periodDec;

    if (bucket.periodInc > 0) {
      periodReceivableByPartner.push({ partner, amount: bucket.periodInc });
    }
    if (bucket.periodDec > 0) {
      periodPayableByPartner.push({ partner, amount: bucket.periodDec });
    }

    const remainRecv = closing > 0 ? closing : 0;
    const remainPay = closing < 0 ? Math.abs(closing) : 0;
    summary.remainingReceivable += remainRecv;
    summary.remainingPayable += remainPay;
    if (remainRecv > 0) remainingReceivableByPartner.push({ partner, amount: remainRecv });
    if (remainPay > 0) remainingPayableByPartner.push({ partner, amount: remainPay });
  }

  const byAmountDesc = (a: PartnerReconPartnerStatsSlice, b: PartnerReconPartnerStatsSlice) =>
    b.amount - a.amount;

  periodReceivableByPartner.sort(byAmountDesc);
  periodPayableByPartner.sort(byAmountDesc);
  remainingReceivableByPartner.sort(byAmountDesc);
  remainingPayableByPartner.sort(byAmountDesc);

  return {
    summary,
    periodReceivableByPartner,
    periodPayableByPartner,
    remainingReceivableByPartner,
    remainingPayableByPartner,
  };
}

export function resolvePartnerLedgerKey(
  partnerName: string | null | undefined,
  partnerId: string | null | undefined,
  partnerNameById: ReadonlyMap<string, string>,
): string {
  const name = (partnerName ?? '').trim();
  if (name) return name;
  const id = (partnerId ?? '').trim();
  if (id && partnerNameById.has(id)) return partnerNameById.get(id)!;
  if (id) return id;
  return '';
}
