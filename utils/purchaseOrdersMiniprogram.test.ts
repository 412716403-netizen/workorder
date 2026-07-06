import { describe, it, expect } from 'vitest';
import { purchaseOrderDocHasUnsettled } from './psiOrderListDisplayFilter';
import { resolvePurchaseOrderLineFlowStatus } from '../views/psi-ops/psiOrderBillFlowHelpers';
import type { PsiRecord } from '../types';

describe('purchaseOrderDocHasUnsettled', () => {
  it('仍有未交清行', () => {
    expect(purchaseOrderDocHasUnsettled('PO-1', [{ id: 'l1', quantity: 10 }], { 'PO-1::l1': 3 })).toBe(true);
  });

  it('全部交清', () => {
    expect(purchaseOrderDocHasUnsettled('PO-1', [{ id: 'l1', quantity: 10 }], { 'PO-1::l1': 10 })).toBe(false);
  });
});

describe('resolvePurchaseOrderLineFlowStatus (采购订单流水)', () => {
  const received = { 'PO-1::r1': 5 };

  it('部分入库', () => {
    const st = resolvePurchaseOrderLineFlowStatus('PO-1', [{ id: 'r1', quantity: 10 } as PsiRecord], received);
    expect(st.statusKey).toBe('partial');
  });

  it('已入库', () => {
    const st = resolvePurchaseOrderLineFlowStatus('PO-1', [{ id: 'r1', quantity: 5 } as PsiRecord], received);
    expect(st.statusKey).toBe('completed');
  });

  it('超收', () => {
    const st = resolvePurchaseOrderLineFlowStatus('PO-1', [{ id: 'r1', quantity: 3 } as PsiRecord], received);
    expect(st.statusKey).toBe('over_received');
  });

  it('未入库', () => {
    const st = resolvePurchaseOrderLineFlowStatus('PO-2', [{ id: 'r2', quantity: 8 } as PsiRecord], {});
    expect(st.statusKey).toBe('none');
  });
});
