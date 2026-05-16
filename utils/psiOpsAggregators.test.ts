import { describe, it, expect } from 'vitest';
import {
  groupRecordsByDocNumber,
  sumReceivedByOrderLine,
  formatPsiQtyDisplay,
} from './psiOpsAggregators';

describe('groupRecordsByDocNumber', () => {
  it('空入参 → 空对象', () => {
    expect(groupRecordsByDocNumber([], 'SALES_ORDER')).toEqual({});
  });

  it('按 type 筛选 + docNumber 分组', () => {
    const recs = [
      { id: 'r1', type: 'SALES_ORDER', docNumber: 'D1' },
      { id: 'r2', type: 'SALES_ORDER', docNumber: 'D1' },
      { id: 'r3', type: 'SALES_ORDER', docNumber: 'D2' },
      { id: 'r4', type: 'PURCHASE_ORDER', docNumber: 'D1' }, // 类型不符
    ];
    const out = groupRecordsByDocNumber(recs, 'SALES_ORDER');
    expect(Object.keys(out).sort()).toEqual(['D1', 'D2']);
    expect(out['D1']).toHaveLength(2);
    expect(out['D2']).toHaveLength(1);
  });

  it('无 docNumber 的记录走 UNGROUPED-<id>', () => {
    const recs = [
      { id: 'rA', type: 'X' },
      { id: 'rB', type: 'X', docNumber: '' },
    ];
    const out = groupRecordsByDocNumber(recs, 'X');
    expect(out['UNGROUPED-rA']).toEqual([recs[0]]);
    expect(out['UNGROUPED-rB']).toEqual([recs[1]]);
  });
});

describe('sumReceivedByOrderLine', () => {
  it('空入参 → 空对象', () => {
    expect(sumReceivedByOrderLine([])).toEqual({});
  });

  it('只统计 PURCHASE_BILL 且带 sourceOrderNumber + sourceLineId 的', () => {
    const recs = [
      { id: '1', type: 'PURCHASE_BILL', sourceOrderNumber: 'PO1', sourceLineId: 'L1', quantity: 10 },
      { id: '2', type: 'PURCHASE_BILL', sourceOrderNumber: 'PO1', sourceLineId: 'L1', quantity: 5 },
      { id: '3', type: 'PURCHASE_BILL', sourceOrderNumber: 'PO1', sourceLineId: 'L2', quantity: 3 },
      { id: '4', type: 'PURCHASE_BILL', sourceLineId: 'L1', quantity: 100 },  // 缺 sourceOrderNumber
      { id: '5', type: 'SALES_BILL', sourceOrderNumber: 'PO1', sourceLineId: 'L1', quantity: 999 }, // 类型不符
    ];
    const out = sumReceivedByOrderLine(recs);
    expect(out['PO1::L1']).toBe(15);
    expect(out['PO1::L2']).toBe(3);
    expect(Object.keys(out)).toHaveLength(2);
  });

  it('quantity 是字符串也可累加', () => {
    const recs = [
      { id: '1', type: 'PURCHASE_BILL', sourceOrderNumber: 'PO', sourceLineId: 'L', quantity: '2' as unknown as number },
      { id: '2', type: 'PURCHASE_BILL', sourceOrderNumber: 'PO', sourceLineId: 'L', quantity: '3' as unknown as number },
    ];
    expect(sumReceivedByOrderLine(recs)['PO::L']).toBe(5);
  });
});

describe('formatPsiQtyDisplay', () => {
  it.each([
    [null, 0],
    [undefined, 0],
    ['', 0],
    [0, 0],
    [12.5, 12.5],
    ['035', 35],
    ['abc', 0],
    [NaN, 0],
  ])('formatPsiQtyDisplay(%p) → %p', (input, expected) => {
    expect(formatPsiQtyDisplay(input as never)).toBe(expected);
  });
});
