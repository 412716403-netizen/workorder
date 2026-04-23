import { describe, it, expect } from 'vitest';
import { purchaseOrderDocHasUnsettled, salesOrderDocHasNotFullyShippedLine } from './psiOrderListDisplayFilter';

describe('purchaseOrderDocHasUnsettled', () => {
  it('订货大于已入库时为未交清', () => {
    const received = { 'PO-1::line-a': 3 };
    expect(purchaseOrderDocHasUnsettled('PO-1', [{ id: 'line-a', quantity: 10 }], received)).toBe(true);
  });

  it('全部入库完成则非未交清', () => {
    const received = { 'PO-1::line-a': 10 };
    expect(purchaseOrderDocHasUnsettled('PO-1', [{ id: 'line-a', quantity: 10 }], received)).toBe(false);
  });
});

describe('salesOrderDocHasNotFullyShippedLine', () => {
  it('行组已发小于订货时为未发齐', () => {
    expect(
      salesOrderDocHasNotFullyShippedLine([
        { id: 'r1', lineGroupId: 'g1', quantity: 5, shippedQuantity: 2 },
      ]),
    ).toBe(true);
  });

  it('全部行组发齐则非未发齐', () => {
    expect(
      salesOrderDocHasNotFullyShippedLine([
        { id: 'r1', lineGroupId: 'g1', quantity: 5, shippedQuantity: 5 },
      ]),
    ).toBe(false);
  });

  it('多行同组按汇总比较', () => {
    expect(
      salesOrderDocHasNotFullyShippedLine([
        { id: 'r1', lineGroupId: 'g1', quantity: 3, shippedQuantity: 1 },
        { id: 'r2', lineGroupId: 'g1', quantity: 2, shippedQuantity: 2 },
      ]),
    ).toBe(true);
  });
});
