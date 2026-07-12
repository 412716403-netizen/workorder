import { describe, expect, it } from 'vitest';
import type { PlanOrder, PsiRecord } from '../types';
import { PlanStatus } from '../types';
import {
  buildPlanDraftFromSalesOrder,
  buildReferencedPlanBySalesOrderProductKey,
  buildUsedSalesOrderProductKeys,
  isReferencedPlanConvertedToOrder,
  listPendingSalesOrdersForPlan,
  resolveReferencedPlanForSalesOrderLine,
  salesOrderLinesForPlan,
} from './planFromSalesOrder';

const soLine = (overrides: Partial<PsiRecord> & { id: string; productId: string; quantity: number }): PsiRecord =>
  ({
    type: 'SALES_ORDER',
    docNumber: 'XS-001',
    partner: '客户甲',
    allocatedQuantity: 0,
    shippedQuantity: 0,
    ...overrides,
  }) as PsiRecord;

describe('buildUsedSalesOrderProductKeys', () => {
  it('collects sourceSalesOrderDocNumber + productId from plans', () => {
    const keys = buildUsedSalesOrderProductKeys([
      {
        id: 'pl1',
        planNumber: 'PLN1',
        productId: 'p1',
        items: [],
        startDate: '2026-01-01',
        status: 'APPROVED',
        customer: '',
        priority: 'Medium',
        customData: { sourceSalesOrderDocNumber: 'XS-001' },
      } as PlanOrder,
    ]);
    expect(keys.has('XS-001|p1')).toBe(true);
  });
});

describe('listPendingSalesOrdersForPlan', () => {
  it('includes orders with unshipped qty and excludes fully allocated', () => {
    const records = [
      soLine({ id: 'r1', productId: 'p1', quantity: 10, lineGroupId: 'lg1' }),
      soLine({
        id: 'r2',
        docNumber: 'XS-002',
        productId: 'p2',
        quantity: 5,
        lineGroupId: 'lg2',
        allocatedQuantity: 5,
        shippedQuantity: 5,
      }),
    ];
    const pending = listPendingSalesOrdersForPlan(records);
    expect(pending.map(([n]) => n)).toEqual(['XS-001']);
  });

  it('hides product lines already referenced by an existing plan', () => {
    const records = [
      soLine({ id: 'r1', productId: 'p1', quantity: 10, lineGroupId: 'lg1' }),
      soLine({ id: 'r2', productId: 'p2', quantity: 8, lineGroupId: 'lg2' }),
    ];
    const plans = [
      {
        id: 'pl1',
        planNumber: 'PLN1',
        productId: 'p1',
        items: [],
        startDate: '2026-01-01',
        status: 'APPROVED',
        customer: '',
        priority: 'Medium',
        customData: { sourceSalesOrderDocNumber: 'XS-001' },
      } as PlanOrder,
    ];
    const lines = salesOrderLinesForPlan(records, buildUsedSalesOrderProductKeys(plans));
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe('p2');
    const pending = listPendingSalesOrdersForPlan(records, plans);
    expect(pending).toHaveLength(1);
  });

  it('sorts by order creation time descending (newest first)', () => {
    const records = [
      soLine({
        id: 'r1',
        docNumber: 'XS-001',
        productId: 'p1',
        quantity: 10,
        lineGroupId: 'lg1',
        timestamp: '2026-01-01T10:00:00.000Z',
      }),
      soLine({
        id: 'r2',
        docNumber: 'XS-002',
        productId: 'p2',
        quantity: 5,
        lineGroupId: 'lg2',
        timestamp: '2026-01-02T10:00:00.000Z',
      }),
    ];
    const pending = listPendingSalesOrdersForPlan(records);
    expect(pending.map(([n]) => n)).toEqual(['XS-002', 'XS-001']);
  });

  it('hides order when all products already have plans', () => {
    const records = [soLine({ id: 'r1', productId: 'p1', quantity: 10, lineGroupId: 'lg1' })];
    const plans = [
      {
        id: 'pl1',
        planNumber: 'PLN1',
        productId: 'p1',
        items: [],
        startDate: '2026-01-01',
        status: 'APPROVED',
        customer: '',
        priority: 'Medium',
        customData: { sourceSalesOrderDocNumber: 'XS-001' },
      } as PlanOrder,
    ];
    expect(listPendingSalesOrdersForPlan(records, plans)).toHaveLength(0);
  });
});

describe('buildReferencedPlanBySalesOrderProductKey', () => {
  it('indexes plans by source sales order doc and product', () => {
    const map = buildReferencedPlanBySalesOrderProductKey([
      {
        id: 'pl1',
        planNumber: 'PLN1',
        productId: 'p1',
        items: [],
        startDate: '2026-01-01',
        status: PlanStatus.APPROVED,
        customer: '',
        priority: 'Medium',
        customData: { sourceSalesOrderDocNumber: 'XS-001' },
      } as PlanOrder,
    ]);
    const plan = resolveReferencedPlanForSalesOrderLine('XS-001', 'p1', map);
    expect(plan?.id).toBe('pl1');
    expect(isReferencedPlanConvertedToOrder(plan!)).toBe(false);
    expect(
      isReferencedPlanConvertedToOrder({ ...plan!, status: PlanStatus.CONVERTED } as PlanOrder),
    ).toBe(true);
  });
});

describe('buildPlanDraftFromSalesOrder', () => {
  it('builds plan items and customData from unshipped line', () => {
    const docItems = [
      soLine({ id: 'r1', productId: 'p1', quantity: 10, lineGroupId: 'lg1', variantId: 'v1' }),
      soLine({ id: 'r2', productId: 'p1', quantity: 5, lineGroupId: 'lg1', variantId: 'v2' }),
    ];
    const lines = salesOrderLinesForPlan(docItems);
    expect(lines).toHaveLength(1);
    const draft = buildPlanDraftFromSalesOrder({
      docNumber: 'XS-001',
      docItems,
      lineId: lines[0].id,
    });
    expect(draft).not.toBeNull();
    expect(draft!.productId).toBe('p1');
    expect(draft!.customer).toBe('客户甲');
    expect(draft!.items).toEqual([
      { variantId: 'v1', quantity: 10 },
      { variantId: 'v2', quantity: 5 },
    ]);
    expect(draft!.customData.sourceSalesOrderDocNumber).toBe('XS-001');
  });

  it('skips customer when importCustomer is false', () => {
    const docItems = [soLine({ id: 'r1', productId: 'p1', quantity: 10, lineGroupId: 'lg1' })];
    const lines = salesOrderLinesForPlan(docItems);
    const draft = buildPlanDraftFromSalesOrder({
      docNumber: 'XS-001',
      docItems,
      lineId: lines[0].id,
      importCustomer: false,
    });
    expect(draft!.customer).toBe('');
  });
});
