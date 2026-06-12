import { describe, expect, it } from 'vitest';
import type { PlanOrder } from '../types';
import { arePlanOrdersScanCompatible } from './planOrderScanCompat';

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
});
