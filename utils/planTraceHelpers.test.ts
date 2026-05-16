import { describe, it, expect } from 'vitest';
import {
  inferTraceGenModeFromExisting,
  collectSubtreePlanIdsForPlan,
} from './planTraceHelpers';
import type { PlanOrder } from '../types';

const plan = (id: string, parentPlanId?: string): Pick<PlanOrder, 'id' | 'parentPlanId'> => ({
  id,
  parentPlanId: parentPlanId ?? null,
});

describe('inferTraceGenModeFromExisting', () => {
  it('全 0 → null', () => {
    expect(inferTraceGenModeFromExisting({ itemCodesTotal: 0, virtualBatchesTotal: 0 })).toBeNull();
  });
  it('有 batch + items → batchWithItems', () => {
    expect(inferTraceGenModeFromExisting({ itemCodesTotal: 5, virtualBatchesTotal: 1 })).toBe('batchWithItems');
  });
  it('仅 batch → batch', () => {
    expect(inferTraceGenModeFromExisting({ itemCodesTotal: 0, virtualBatchesTotal: 1 })).toBe('batch');
  });
  it('仅 itemCode → batchWithItems', () => {
    expect(inferTraceGenModeFromExisting({ itemCodesTotal: 10, virtualBatchesTotal: 0 })).toBe('batchWithItems');
  });
});

describe('collectSubtreePlanIdsForPlan', () => {
  it('rootId 自身没有子计划 → [rootId]', () => {
    expect(collectSubtreePlanIdsForPlan('p1', [plan('p1'), plan('p2')])).toEqual(['p1']);
  });

  it('BFS 收集 2 层子计划', () => {
    const plans = [
      plan('root'),
      plan('a', 'root'),
      plan('b', 'root'),
      plan('a1', 'a'),
      plan('a2', 'a'),
      plan('b1', 'b'),
      plan('unrelated'),
    ];
    const out = collectSubtreePlanIdsForPlan('root', plans);
    expect(out[0]).toBe('root');
    // 第二层 a / b
    expect(out.slice(1, 3).sort()).toEqual(['a', 'b']);
    // 第三层
    expect(out.slice(3).sort()).toEqual(['a1', 'a2', 'b1']);
    expect(out).not.toContain('unrelated');
  });

  it('rootId 不在 plans 中 → 仍返回 [rootId]', () => {
    expect(collectSubtreePlanIdsForPlan('nonexistent', [plan('x')])).toEqual(['nonexistent']);
  });
});
