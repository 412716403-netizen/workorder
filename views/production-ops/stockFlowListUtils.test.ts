import { describe, expect, it } from 'vitest';
import { isProductionMaterialFlowRecord, sortStockFlowRecordsByDoc, stockFlowDateRangeFromRecords } from './stockFlowListUtils';
import type { ProductionOpRecord } from '../../types';
import { PROD_OP_REASON_FROM_DEV } from '../../shared/types';

describe('isProductionMaterialFlowRecord', () => {
  it('excludes 开发领退 from production material flow', () => {
    expect(
      isProductionMaterialFlowRecord({
        type: 'STOCK_OUT',
        reason: PROD_OP_REASON_FROM_DEV,
      } as ProductionOpRecord),
    ).toBe(false);
    expect(
      isProductionMaterialFlowRecord({
        type: 'STOCK_RETURN',
        reason: PROD_OP_REASON_FROM_DEV,
      } as ProductionOpRecord),
    ).toBe(false);
  });

  it('keeps normal production material ops', () => {
    expect(isProductionMaterialFlowRecord({ type: 'STOCK_OUT' } as ProductionOpRecord)).toBe(true);
    expect(isProductionMaterialFlowRecord({ type: 'STOCK_RETURN', reason: '来自于返工' } as ProductionOpRecord)).toBe(
      true,
    );
  });
});

describe('sortStockFlowRecordsByDoc', () => {
  it('drops 开发领退 records', () => {
    const sorted = sortStockFlowRecordsByDoc([
      { id: '1', type: 'STOCK_OUT', docNo: 'LL1', reason: PROD_OP_REASON_FROM_DEV, timestamp: '2026-07-01T00:00:00.000Z' },
      { id: '2', type: 'STOCK_OUT', docNo: 'LL2', timestamp: '2026-07-02T00:00:00.000Z' },
    ] as ProductionOpRecord[]);
    expect(sorted.map((r) => r.id)).toEqual(['2']);
  });
});

describe('stockFlowDateRangeFromRecords', () => {
  it('uses min/max ymd from records', () => {
    const records = [
      { timestamp: '2026-03-01T10:00:00.000Z' },
      { timestamp: '2026-03-15T08:00:00.000Z' },
    ] as ProductionOpRecord[];
    expect(stockFlowDateRangeFromRecords(records, '2026-01-01')).toEqual({
      dateFrom: '2026-03-01',
      dateTo: '2026-03-15',
    });
  });

  it('falls back when no records', () => {
    expect(stockFlowDateRangeFromRecords([], '2026-07-02')).toEqual({
      dateFrom: '2026-07-02',
      dateTo: '2026-07-02',
    });
  });
});
