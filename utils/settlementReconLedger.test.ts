import { describe, it, expect } from 'vitest';
import {
  buildSettlementReconBalances,
  buildSettlementReconList,
  computeSettlementOpeningBalance,
  computeSettlementReconRowDelta,
  summarizeSettlementReconBalances,
} from './settlementReconLedger';
import type { FinanceRecord, ProductionOpRecord } from '../types';

describe('computeSettlementReconRowDelta', () => {
  it('报工单减少应收', () => {
    expect(
      computeSettlementReconRowDelta({
        source: 'work_report',
        reportNo: 'R1',
        timestamp: '',
        workerId: 'w1',
        workerName: '张三',
        amount: 80,
        items: [],
      }),
    ).toEqual({ inc: 0, dec: 80 });
  });

  it('付款单增加应收', () => {
    expect(
      computeSettlementReconRowDelta({
        source: 'settlement_finance',
        rec: {
          id: 'f1',
          type: 'PAYMENT',
          amount: 50,
          partner: '',
          operator: '',
          timestamp: '',
          status: 'COMPLETED',
          workerId: 'w1',
        } as FinanceRecord,
      }),
    ).toEqual({ inc: 50, dec: 0 });
  });
});

describe('buildSettlementReconList', () => {
  it('按工人汇总报工单并排序', () => {
    const rows = buildSettlementReconList({
      workerId: 'w1',
      workerName: '张三',
      orders: [
        {
          id: 'o1',
          orderNumber: 'WO-1',
          productId: 'p1',
          productName: '产品A',
          milestones: [
            {
              templateId: 'n1',
              name: '缝制',
              reports: [
                {
                  id: 'r1',
                  workerId: 'w1',
                  timestamp: '2026-05-10T10:00:00',
                  quantity: 2,
                  rate: 10,
                  reportNo: 'BG-001',
                },
              ],
            },
          ],
        } as never,
      ],
      productMilestoneProgresses: [],
      productMap: new Map([['p1', { id: 'p1', name: '产品A', sku: 'A1' } as never]]),
      workerProdRecords: [],
      workerFinanceRecords: [],
      globalNodes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe('work_report');
    if (rows[0]?.source === 'work_report') {
      expect(rows[0].amount).toBe(20);
      expect(rows[0].items[0]?.productId).toBe('p1');
    }
  });

  it('上期余额为开始日期之前的累计结余', () => {
    const base = {
      workerId: 'w1',
      workerName: '张三',
      orders: [
        {
          id: 'o1',
          orderNumber: 'WO-1',
          productId: 'p1',
          productName: '产品A',
          milestones: [
            {
              templateId: 'n1',
              name: '缝制',
              reports: [
                {
                  id: 'r1',
                  workerId: 'w1',
                  timestamp: '2026-05-01T10:00:00',
                  quantity: 1,
                  rate: 100,
                  reportNo: 'BG-OLD',
                },
                {
                  id: 'r2',
                  workerId: 'w1',
                  timestamp: '2026-05-15T10:00:00',
                  quantity: 1,
                  rate: 50,
                  reportNo: 'BG-NEW',
                },
              ],
            },
          ],
        } as never,
      ],
      productMilestoneProgresses: [],
      productMap: new Map(),
      workerProdRecords: [],
      workerFinanceRecords: [],
      globalNodes: [],
    };
    const opening = computeSettlementOpeningBalance({ ...base, dateFrom: '2026-05-10' });
    expect(opening).toBe(-100);
    const period = buildSettlementReconList({ ...base, dateFrom: '2026-05-10', dateTo: '' });
    expect(summarizeSettlementReconBalances(period, opening).closingBalance).toBe(-150);
  });
});

describe('buildSettlementReconBalances', () => {
  it('从上期余额逐行累计', () => {
    const rows = buildSettlementReconList({
      workerId: 'w1',
      workerName: '张三',
      orders: [],
      productMilestoneProgresses: [],
      productMap: new Map(),
      workerProdRecords: [
        {
          id: 'p1',
          type: 'REWORK_REPORT',
          workerId: 'w1',
          amount: 30,
          operator: '',
          timestamp: '2026-05-10T10:00:00',
          productId: 'p1',
        } as ProductionOpRecord,
      ],
      workerFinanceRecords: [],
      globalNodes: [],
    });
    const balanced = buildSettlementReconBalances(rows, -10);
    expect(balanced[0]?.balance).toBe(-40);
  });
});
