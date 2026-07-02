import { describe, expect, it } from 'vitest';
import {
  getEffectivePlanMilestoneNodeIds,
  normalizePlanMilestoneNodeIdsForSave,
} from './planMilestoneRoute';

describe('getEffectivePlanMilestoneNodeIds', () => {
  it('uses plan override when non-empty', () => {
    expect(
      getEffectivePlanMilestoneNodeIds(
        { milestoneNodeIds: ['n2', 'n3'] },
        { milestoneNodeIds: ['n1', 'n2'] },
      ),
    ).toEqual(['n2', 'n3']);
  });

  it('falls back to product when plan has no override', () => {
    expect(
      getEffectivePlanMilestoneNodeIds(
        { milestoneNodeIds: undefined },
        { milestoneNodeIds: ['n1', 'n2'] },
      ),
    ).toEqual(['n1', 'n2']);
    expect(
      getEffectivePlanMilestoneNodeIds(
        { milestoneNodeIds: [] },
        { milestoneNodeIds: ['n1'] },
      ),
    ).toEqual(['n1']);
  });

  it('returns empty when neither has route', () => {
    expect(getEffectivePlanMilestoneNodeIds({}, {})).toEqual([]);
  });
});

describe('normalizePlanMilestoneNodeIdsForSave', () => {
  it('returns null when same as product route', () => {
    expect(normalizePlanMilestoneNodeIdsForSave(['a', 'b'], ['a', 'b'])).toBeNull();
  });

  it('returns null when edited is empty', () => {
    expect(normalizePlanMilestoneNodeIdsForSave([], ['a'])).toBeNull();
  });

  it('returns copy when different from product', () => {
    expect(normalizePlanMilestoneNodeIdsForSave(['b', 'a'], ['a', 'b'])).toEqual(['b', 'a']);
  });
});
