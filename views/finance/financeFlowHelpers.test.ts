import { describe, expect, it } from 'vitest';
import type { FinanceCategory, FinanceRecord } from '../../types';
import { filterFinanceFlowRows, sumFinanceFlowTotals } from './financeFlowHelpers';

const baseRec = (over: Partial<FinanceRecord>): FinanceRecord => ({
  id: 'f1',
  type: 'RECEIPT',
  amount: 100,
  partner: '客户A',
  operator: '张三',
  timestamp: '2026-06-01T10:00:00.000Z',
  status: 'COMPLETED',
  ...over,
});

describe('filterFinanceFlowRows', () => {
  const records = [
    baseRec({ id: 'f1', docNo: 'SKD20260601-0001', partner: '客户A', operator: '张三', productId: 'p1' }),
    baseRec({ id: 'f2', docNo: 'SKD20260601-0002', partner: '客户B', operator: '李四', amount: 200 }),
  ];
  const productMap = new Map([
    ['p1', { id: 'p1', name: '春季款', sku: 'SP-001', categoryId: 'c1', variants: [] } as never],
  ]);
  const categoryMap = new Map([
    ['cat1', { id: 'cat1', name: '货款', kind: 'RECEIPT' } as FinanceCategory],
  ]);

  it('returns all when filters empty', () => {
    expect(filterFinanceFlowRows(records, {
      docNo: '',
      partner: '',
      operator: '',
      categoryKeyword: '',
      productKeyword: '',
    })).toHaveLength(2);
  });

  it('filters by docNo and operator', () => {
    const out = filterFinanceFlowRows(
      records,
      { docNo: '0002', partner: '', operator: '李', categoryKeyword: '', productKeyword: '' },
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('f2');
  });

  it('filters by product keyword', () => {
    const out = filterFinanceFlowRows(
      records,
      { docNo: '', partner: '', operator: '', categoryKeyword: '', productKeyword: 'SP-001' },
      productMap,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('f1');
  });

  it('filters by category name', () => {
    const out = filterFinanceFlowRows(
      [baseRec({ id: 'f3', categoryId: 'cat1' })],
      { docNo: '', partner: '', operator: '', categoryKeyword: '货', productKeyword: '' },
      undefined,
      categoryMap,
    );
    expect(out).toHaveLength(1);
  });
});

describe('sumFinanceFlowTotals', () => {
  it('sums amount and counts rows', () => {
    const totals = sumFinanceFlowTotals([
      baseRec({ amount: 100 }),
      baseRec({ amount: 50.5 }),
    ]);
    expect(totals.rowCount).toBe(2);
    expect(totals.totalAmount).toBe(150.5);
  });
});
