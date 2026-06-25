import { describe, expect, it } from 'vitest';
import type { PlanOrder } from '../types';
import {
  arePlanOrdersInSamePlanTreeRoot,
  arePlanOrdersScanCompatible,
  isReportScanPlanCompatible,
} from './planOrderScanCompat';

function plan(id: string, parentPlanId?: string): PlanOrder {
  return {
    id,
    parentPlanId,
    planNumber: id,
    productId: 'p1',
    items: [],
    startDate: '2026-01-01',
    status: 'InProgress',
    customer: '',
    priority: 'Medium',
  };
}

describe('arePlanOrdersScanCompatible', () => {
  const plans = [plan('root'), plan('child', 'root'), plan('grand', 'child')];

  it('same plan id', () => {
    expect(arePlanOrdersScanCompatible(plans, 'root', 'root')).toBe(true);
  });

  it('parent batch on root, work order on child', () => {
    expect(arePlanOrdersScanCompatible(plans, 'root', 'child')).toBe(true);
  });

  it('batch on child, work order on root', () => {
    expect(arePlanOrdersScanCompatible(plans, 'child', 'root')).toBe(true);
  });

  it('different plan trees', () => {
    const mixed = [...plans, plan('other-root')];
    expect(arePlanOrdersScanCompatible(mixed, 'other-root', 'child')).toBe(false);
  });

  it('sibling child plans under same root are not ancestor-compatible', () => {
    const siblingPlans = [plan('root'), plan('child-a', 'root'), plan('child-b', 'root')];
    expect(arePlanOrdersScanCompatible(siblingPlans, 'child-a', 'child-b')).toBe(false);
    expect(arePlanOrdersInSamePlanTreeRoot(siblingPlans, 'child-a', 'child-b')).toBe(true);
  });
});

describe('isReportScanPlanCompatible', () => {
  const siblingPlans = [plan('root'), plan('child-a', 'root'), plan('child-b', 'root')];

  it('product mode allows code on sibling sub-plan of product orders', () => {
    expect(
      isReportScanPlanCompatible(siblingPlans, 'child-a', {
        productionLinkMode: 'product',
        productPlanOrderIds: ['child-b'],
      }),
    ).toBe(true);
  });

  it('order mode rejects sibling sub-plans', () => {
    expect(
      isReportScanPlanCompatible(siblingPlans, 'child-a', {
        productionLinkMode: 'order',
        anchorPlanOrderId: 'child-b',
        productPlanOrderIds: [],
      }),
    ).toBe(false);
  });
});
