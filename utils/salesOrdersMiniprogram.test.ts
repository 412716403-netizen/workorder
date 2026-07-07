import { describe, it, expect } from 'vitest';
import { salesOrderDocHasNotFullyShippedLine, salesOrderDocFullyShipped } from './psiOrderListDisplayFilter';
import { resolveSalesOrderLineFlowStatus } from '../views/psi-ops/psiOrderBillFlowHelpers';
import type { PsiRecord } from '../types';

describe('salesOrderDocHasNotFullyShippedLine', () => {
  it('仍有未发齐行', () => {
    expect(salesOrderDocHasNotFullyShippedLine([
      { id: 'l1', quantity: 10, shippedQuantity: 3 },
    ])).toBe(true);
  });

  it('全部发齐', () => {
    expect(salesOrderDocHasNotFullyShippedLine([
      { id: 'l1', quantity: 10, shippedQuantity: 10 },
    ])).toBe(false);
  });
});

describe('salesOrderDocFullyShipped', () => {
  it('已完成', () => {
    expect(salesOrderDocFullyShipped([
      { id: 'l1', quantity: 5, shippedQuantity: 5 },
    ])).toBe(true);
  });

  it('未完成', () => {
    expect(salesOrderDocFullyShipped([
      { id: 'l1', quantity: 5, shippedQuantity: 2 },
    ])).toBe(false);
  });
});

describe('resolveSalesOrderLineFlowStatus (销售订单流水)', () => {
  it('未配货', () => {
    const st = resolveSalesOrderLineFlowStatus([{ id: 'r1', quantity: 10 } as PsiRecord]);
    expect(st.statusKey).toBe('unallocated');
  });

  it('已发齐', () => {
    const st = resolveSalesOrderLineFlowStatus([
      { id: 'r1', quantity: 5, shippedQuantity: 5, allocatedQuantity: 5 } as PsiRecord,
    ]);
    expect(st.statusKey).toBe('fully_shipped');
  });

  it('有待发', () => {
    const st = resolveSalesOrderLineFlowStatus([
      { id: 'r1', quantity: 10, allocatedQuantity: 8, shippedQuantity: 3 } as PsiRecord,
    ]);
    expect(st.statusKey).toBe('pending_ship');
  });

  it('超配', () => {
    const st = resolveSalesOrderLineFlowStatus([
      { id: 'r1', quantity: 5, allocatedQuantity: 8 } as PsiRecord,
    ]);
    expect(st.statusKey).toBe('over_allocated');
  });
});
