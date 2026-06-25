import { describe, it, expect } from 'vitest';
import { computePurchaseProgressPct, isOverReceived } from './purchaseProgress';

describe('computePurchaseProgressPct', () => {
  it('returns null when nothing ordered', () => {
    expect(computePurchaseProgressPct({ received: 0, ordered: 0 })).toBeNull();
    expect(computePurchaseProgressPct({ received: 5, ordered: 0 })).toBeNull();
  });

  it('returns received / ordered ratio', () => {
    expect(computePurchaseProgressPct({ received: 5, ordered: 10 })).toBe(0.5);
    expect(computePurchaseProgressPct({ received: 0, ordered: 10 })).toBe(0);
  });

  it('clamps over-received to 1', () => {
    expect(computePurchaseProgressPct({ received: 15, ordered: 10 })).toBe(1);
  });

  it('returns 1 when fully received', () => {
    expect(computePurchaseProgressPct({ received: 10, ordered: 10 })).toBe(1);
  });
});

describe('isOverReceived', () => {
  it('is true only when received exceeds a positive ordered', () => {
    expect(isOverReceived({ received: 11, ordered: 10 })).toBe(true);
    expect(isOverReceived({ received: 10, ordered: 10 })).toBe(false);
    expect(isOverReceived({ received: 5, ordered: 10 })).toBe(false);
    expect(isOverReceived({ received: 5, ordered: 0 })).toBe(false);
  });
});
