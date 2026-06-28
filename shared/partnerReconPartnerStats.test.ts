import { describe, expect, it } from 'vitest';
import {
  applyPartnerLedgerDelta,
  computePartnerReconFinanceDocDelta,
  computePartnerReconPsiDocDelta,
  emptyPartnerLedgerBucket,
  summarizePartnerLedgerBuckets,
} from './partnerReconPartnerStats';

describe('partnerReconPartnerStats', () => {
  it('matches sales/receipt partner recon deltas', () => {
    expect(computePartnerReconPsiDocDelta('SALES_BILL', 1000)).toEqual({ inc: 1000, dec: 0 });
    expect(computePartnerReconFinanceDocDelta('RECEIPT', 400)).toEqual({ inc: 0, dec: 400 });
  });

  it('summarizes period and remaining receivable/payable by partner', () => {
    const buckets = new Map<string, ReturnType<typeof emptyPartnerLedgerBucket>>();
    const a = emptyPartnerLedgerBucket();
    applyPartnerLedgerDelta(a, { inc: 1000, dec: 0 }, true);
    applyPartnerLedgerDelta(a, { inc: 0, dec: 300 }, true);
    buckets.set('A公司', a);

    const b = emptyPartnerLedgerBucket();
    applyPartnerLedgerDelta(b, { inc: 0, dec: 500 }, true);
    buckets.set('B公司', b);

    const result = summarizePartnerLedgerBuckets(buckets);
    expect(result.summary.periodReceivable).toBe(1000);
    expect(result.summary.periodPayable).toBe(800);
    expect(result.summary.remainingReceivable).toBe(700);
    expect(result.summary.remainingPayable).toBe(500);
    expect(result.remainingReceivableByPartner[0]).toEqual({ partner: 'A公司', amount: 700 });
    expect(result.remainingPayableByPartner[0]).toEqual({ partner: 'B公司', amount: 500 });
  });
});
