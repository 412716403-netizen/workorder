import { describe, it, expect } from 'vitest';
import { buildPartnerReconciliationExportSheet } from './buildPartnerReconciliationExportSheet';
import type { PartnerReconBalancedRow } from './partnerReconLedger';
import type { PartnerProductReconRow } from './partnerReconProductLedger';

describe('buildPartnerReconciliationExportSheet', () => {
  const summary = { openingBalance: 100, periodInc: 50, periodDec: 30, closingBalance: 120 };

  it('按单据模式含汇总与明细表头', () => {
    const rows: PartnerReconBalancedRow[] = [
      {
        row: { source: 'psi', docType: '采购单', docNo: 'PB-1', timestamp: '2026-05-01T10:00:00', partner: '万新', amount: 10 },
        receivableInc: 0,
        receivableDec: 10,
        balance: 90,
      },
    ];
    const aoa = buildPartnerReconciliationExportSheet({
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      partnerName: '万新',
      summary,
      viewMode: 'document',
      documentRows: rows,
      productRows: [],
    });
    expect(aoa[0]?.[0]).toContain('对账时间范围');
    expect(aoa[1]?.[0]).toBe('合作单位：');
    expect(aoa[1]?.[1]).toBe('万新');
    expect(aoa.some(r => r[0] === '明细（按单据，当前搜索结果）')).toBe(true);
    expect(aoa.some(r => r[0] === '业务时间')).toBe(true);
    expect(aoa.some(r => r[1] === 'PB-1')).toBe(true);
  });

  it('按产品模式含产品汇总块', () => {
    const prodRows: PartnerProductReconRow[] = [
      {
        kind: 'line',
        timestamp: '2026-05-01T10:00:00',
        docNo: 'PB-1',
        docType: '采购单',
        partner: '万新',
        productName: '产品A',
        quantity: 2,
        unitPrice: 10,
        receivableInc: 0,
        receivableDec: 20,
        balance: 80,
        detailTarget: { source: 'psi', docType: '采购单', docNo: 'PB-1', timestamp: '', partner: '', amount: 20 },
      },
    ];
    const aoa = buildPartnerReconciliationExportSheet({
      dateFrom: '2026-05-01',
      dateTo: '',
      partnerName: '万新',
      summary,
      viewMode: 'product',
      documentRows: [],
      productRows: prodRows,
    });
    expect(aoa.some(r => r[0] === '明细（按产品，当前搜索结果）')).toBe(true);
    expect(aoa.some(r => r[0] === '产品汇总（按单价，基于上方筛选后明细）')).toBe(true);
    const footHeader = aoa.findIndex(r => r[0] === '产品' && r[1] === '数量');
    expect(footHeader).toBeGreaterThan(-1);
    const footData = aoa[footHeader + 1];
    expect(footData?.[0]).toBe('产品A');
    expect(footData?.[1]).toBe(2);
    expect(footData?.[2]).toBe(10);
    expect(footData?.[3]).toBe(20);
  });
});
