import { describe, expect, it } from 'vitest';
import { stockFlowDateRangeFromRecords } from './stockFlowListUtils';
import type { ProductionOpRecord } from '../types';

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
