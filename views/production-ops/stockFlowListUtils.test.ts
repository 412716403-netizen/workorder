import { describe, expect, it } from 'vitest';
import {
  buildStockDocDetailFromRecords,
  getStockFlowBizType,
  getStockFlowTypeLabel,
  isProductionMaterialFlowRecord,
  sortStockFlowRecordsByDoc,
  stockFlowDateRangeFromRecords,
} from './stockFlowListUtils';
import type { ProductionOpRecord } from '../../types';
import { PROD_OP_REASON_FROM_DEV, PROD_OP_REASON_FROM_REWORK } from '../../shared/types';

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

describe('getStockFlowBizType / getStockFlowTypeLabel', () => {
  it('maps 返工领料 / 返工退料 by reason', () => {
    const issue = { type: 'STOCK_OUT', reason: PROD_OP_REASON_FROM_REWORK } as ProductionOpRecord;
    const ret = { type: 'STOCK_RETURN', reason: PROD_OP_REASON_FROM_REWORK } as ProductionOpRecord;
    expect(getStockFlowBizType(issue)).toBe('ISSUE_REWORK');
    expect(getStockFlowBizType(ret)).toBe('RETURN_REWORK');
    expect(getStockFlowTypeLabel(issue)).toBe('返工领料');
    expect(getStockFlowTypeLabel(ret)).toBe('返工退料');
  });

  it('keeps 外协 / 本厂 mapping for non-rework records', () => {
    expect(getStockFlowBizType({ type: 'STOCK_OUT' } as ProductionOpRecord)).toBe('ISSUE_INTERNAL');
    expect(getStockFlowBizType({ type: 'STOCK_OUT', partner: '外协厂' } as ProductionOpRecord)).toBe('ISSUE_OUTSOURCE');
    expect(getStockFlowBizType({ type: 'STOCK_RETURN' } as ProductionOpRecord)).toBe('RETURN_INTERNAL');
    expect(getStockFlowBizType({ type: 'STOCK_RETURN', partner: '外协厂' } as ProductionOpRecord)).toBe('RETURN_OUTSOURCE');
    expect(getStockFlowTypeLabel({ type: 'STOCK_OUT' } as ProductionOpRecord)).toBe('领料发出');
    expect(getStockFlowTypeLabel({ type: 'STOCK_RETURN', partner: '外协厂' } as ProductionOpRecord)).toBe('外协生产退料');
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

describe('buildStockDocDetailFromRecords', () => {
  it('copies operator from first line of the doc', () => {
    const detail = buildStockDocDetailFromRecords('LL20260721-0007', [
      {
        id: '1',
        type: 'STOCK_OUT',
        docNo: 'LL20260721-0007',
        productId: 'p1',
        quantity: 11,
        operator: '小郑',
        timestamp: '2026-07-21T05:16:00.000Z',
        warehouseId: 'w1',
        orderId: 'o1',
        status: '已完成',
      } as ProductionOpRecord,
    ]);
    expect(detail?.operator).toBe('小郑');
    expect(detail?.docNo).toBe('LL20260721-0007');
  });
});
