import { describe, it, expect } from 'vitest';
import {
  buildPartnerReconBalances,
  computePartnerReconRowDelta,
  summarizePartnerReconBalances,
  type PartnerReconRow,
} from './partnerReconLedger';

const fin = (type: 'RECEIPT' | 'PAYMENT', amount: number): PartnerReconRow => ({
  source: 'finance',
  rec: { id: `fin-${type}`, type, amount, timestamp: '', partner: '万新' },
});

const psi = (docType: string, amount: number): PartnerReconRow => ({
  source: 'psi',
  docType,
  docNo: `DOC-${docType}`,
  timestamp: '',
  partner: '万新',
  amount,
});

describe('computePartnerReconRowDelta', () => {
  it('采购入库减少应收', () => {
    expect(computePartnerReconRowDelta(psi('采购入库', 24.4))).toEqual({ inc: 0, dec: 24.4 });
  });

  it('销售单正数增加应收', () => {
    expect(computePartnerReconRowDelta(psi('销售单', 1000))).toEqual({ inc: 1000, dec: 0 });
  });

  it('销售单负数（退货）减少应收', () => {
    expect(computePartnerReconRowDelta(psi('销售单', -50))).toEqual({ inc: 0, dec: 50 });
  });

  it('外协收回减少应收', () => {
    expect(computePartnerReconRowDelta(psi('外协收回', 300))).toEqual({ inc: 0, dec: 300 });
  });

  it('返工收回减少应收', () => {
    expect(computePartnerReconRowDelta(psi('返工收回', 300))).toEqual({ inc: 0, dec: 300 });
  });

  it('收款单减少应收', () => {
    expect(computePartnerReconRowDelta(fin('RECEIPT', 500))).toEqual({ inc: 0, dec: 500 });
  });

  it('付款单增加应收', () => {
    expect(computePartnerReconRowDelta(fin('PAYMENT', 200))).toEqual({ inc: 200, dec: 0 });
  });
});

describe('buildPartnerReconBalances', () => {
  it('从 0 起算逐行累计', () => {
    const rows = [psi('采购入库', 24.4), psi('采购入库', 53200)];
    const balanced = buildPartnerReconBalances(rows, 0);
    expect(balanced[0].balance).toBe(-24.4);
    expect(balanced[1].balance).toBe(-53224.4);
  });

  it('叠加期初余额', () => {
    const rows = [psi('采购入库', 24.4)];
    const balanced = buildPartnerReconBalances(rows, -10000);
    expect(balanced[0].balance).toBe(-10024.4);
  });
});

describe('summarizePartnerReconBalances', () => {
  it('汇总公式：期末 = 期初 + 增 - 减', () => {
    const rows = [
      psi('销售单', 1000),
      psi('采购入库', 200),
      fin('RECEIPT', 300),
    ];
    const summary = summarizePartnerReconBalances(rows, -5000);
    expect(summary.periodInc).toBe(1000);
    expect(summary.periodDec).toBe(500);
    expect(summary.closingBalance).toBe(-5000 + 1000 - 500);
    expect(summary.closingBalance).toBe(-4500);
  });
});
