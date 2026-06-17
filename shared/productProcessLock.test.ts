import { describe, expect, it } from 'vitest';
import {
  isProductProcessLocked,
  milestoneNodeIdsEqual,
  productHasLockableProductionOrders,
} from './productProcessLock';

describe('milestoneNodeIdsEqual', () => {
  it('compares order-sensitive sequences', () => {
    expect(milestoneNodeIdsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(milestoneNodeIdsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(milestoneNodeIdsEqual(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('productHasLockableProductionOrders', () => {
  it('ignores PENDING_PROCESS only', () => {
    const orders = [
      { productId: 'p1', status: 'PENDING_PROCESS' },
      { productId: 'p1', status: 'PLANNING' },
    ];
    expect(productHasLockableProductionOrders(orders, 'p1')).toBe(true);
    expect(productHasLockableProductionOrders([{ productId: 'p1', status: 'PENDING_PROCESS' }], 'p1')).toBe(false);
  });
});

describe('isProductProcessLocked', () => {
  it('locks in product mode when routes exist and orders are active', () => {
    expect(
      isProductProcessLocked(
        'product',
        { id: 'p1', milestoneNodeIds: ['n1'] },
        [{ productId: 'p1', status: 'IN_PROGRESS' }],
      ),
    ).toBe(true);
  });

  it('does not lock in order mode', () => {
    expect(
      isProductProcessLocked(
        'order',
        { id: 'p1', milestoneNodeIds: ['n1'], processLocked: true },
        [{ productId: 'p1', status: 'IN_PROGRESS' }],
      ),
    ).toBe(true); // API flag still respected
    expect(
      isProductProcessLocked(
        'order',
        { id: 'p1', milestoneNodeIds: ['n1'] },
        [{ productId: 'p1', status: 'IN_PROGRESS' }],
      ),
    ).toBe(false);
  });

  it('allows first-time route config when no milestone nodes yet', () => {
    expect(
      isProductProcessLocked(
        'product',
        { id: 'p1', milestoneNodeIds: [] },
        [{ productId: 'p1', status: 'PLANNING' }],
      ),
    ).toBe(false);
  });
});
