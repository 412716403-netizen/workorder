import { describe, it, expect } from 'vitest';
import { OrderDispatchStatus } from '../types';
import { isOrderDispatchCompleted, shouldShowOrderInIncompleteListFilter } from './orderDispatchListFilter';

describe('orderDispatchListFilter', () => {
  it('isOrderDispatchCompleted is true only for COMPLETED', () => {
    expect(isOrderDispatchCompleted({ dispatchStatus: OrderDispatchStatus.COMPLETED })).toBe(true);
    expect(isOrderDispatchCompleted({ dispatchStatus: OrderDispatchStatus.IN_PROGRESS })).toBe(false);
    expect(isOrderDispatchCompleted({})).toBe(false);
  });

  it('shouldShowOrderInIncompleteListFilter passes through when filter off', () => {
    expect(
      shouldShowOrderInIncompleteListFilter({ dispatchStatus: OrderDispatchStatus.COMPLETED }, false),
    ).toBe(true);
  });

  it('shouldShowOrderInIncompleteListFilter hides completed when filter on', () => {
    expect(
      shouldShowOrderInIncompleteListFilter({ dispatchStatus: OrderDispatchStatus.COMPLETED }, true),
    ).toBe(false);
    expect(
      shouldShowOrderInIncompleteListFilter({ dispatchStatus: OrderDispatchStatus.IN_PROGRESS }, true),
    ).toBe(true);
    expect(shouldShowOrderInIncompleteListFilter({}, true)).toBe(true);
  });
});
