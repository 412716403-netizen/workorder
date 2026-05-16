import { describe, it, expect } from 'vitest';
import type { ProductionOpRecord } from '../types';
import {
  isOutsourceReceiveReport,
  outsourceReceiveDocNoFromReport,
  findOutsourceReceiveOpLine,
  resolveOutsourceReceiveReportEconomics,
  resolveReportDisplayEconomics,
} from './outsourceReceiveReportDisplay';

const recv: ProductionOpRecord = {
  id: 'wx-1',
  type: 'OUTSOURCE',
  status: '已收回',
  docNo: 'WR-001',
  orderId: 'o1',
  productId: 'p1',
  nodeId: 'n1',
  variantId: 'v1',
  quantity: 10,
  unitPrice: 3.5,
  amount: 35,
  weight: 12.5,
  operator: '外协厂A',
  timestamp: '2026-05-16',
};

describe('outsourceReceiveReportDisplay', () => {
  it('detects outsource receive report', () => {
    expect(isOutsourceReceiveReport({ customData: { source: 'outsourceReceive' } })).toBe(true);
    expect(isOutsourceReceiveReport({ reportNo: '外协收回·WR-001' })).toBe(true);
    expect(isOutsourceReceiveReport({ operator: '外协收回' })).toBe(true);
    expect(isOutsourceReceiveReport({ reportNo: 'BG-001' })).toBe(false);
  });

  it('parses doc no from reportNo prefix', () => {
    expect(outsourceReceiveDocNoFromReport({ reportNo: '外协收回·WR-001' })).toBe('WR-001');
    expect(outsourceReceiveDocNoFromReport({ customData: { docNo: 'WR-002' } })).toBe('WR-002');
  });

  it('finds matching outsource receive line', () => {
    const hit = findOutsourceReceiveOpLine([recv], {
      docNo: 'WR-001',
      nodeId: 'n1',
      productId: 'p1',
      orderId: 'o1',
      variantId: 'v1',
    });
    expect(hit?.id).toBe('wx-1');
  });

  it('resolveOutsourceReceiveReportEconomics uses op unitPrice amount weight', () => {
    const eco = resolveOutsourceReceiveReportEconomics([recv], {
      docNo: 'WR-001',
      nodeId: 'n1',
      productId: 'p1',
      orderId: 'o1',
      variantId: 'v1',
      quantity: 10,
    });
    expect(eco).toEqual({ rate: 3.5, amount: 35, weight: 12.5 });
  });

  it('resolveReportDisplayEconomics prefers outsource receive for wx report', () => {
    const eco = resolveReportDisplayEconomics(
      {
        quantity: 10,
        reportNo: '外协收回·WR-001',
        variantId: 'v1',
        rate: 1,
        weight: 1,
      },
      [recv],
      { nodeId: 'n1', productId: 'p1', orderId: 'o1', fallbackRate: 99 },
    );
    expect(eco.rate).toBe(3.5);
    expect(eco.amount).toBe(35);
    expect(eco.weight).toBe(12.5);
  });

  it('falls back to report rate when not outsource receive', () => {
    const eco = resolveReportDisplayEconomics(
      { quantity: 5, rate: 2, weight: 0 },
      [recv],
      { nodeId: 'n1', productId: 'p1', orderId: 'o1', fallbackRate: 99 },
    );
    expect(eco.rate).toBe(2);
    expect(eco.amount).toBe(10);
  });
});
