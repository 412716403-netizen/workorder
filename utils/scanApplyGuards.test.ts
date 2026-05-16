import { describe, expect, it } from 'vitest';
import { checkExceedMax, wouldExceedMax, formatExceedMaxMessage } from './scanApplyGuards';

describe('checkExceedMax', () => {
  it('returns not-exceeds when within cap', () => {
    const r = checkExceedMax(3, 2, 5);
    expect(r.exceeds).toBe(false);
    expect(r.remaining).toBe(2);
    expect(r.message).toBeNull();
  });

  it('allows exactly hitting the cap', () => {
    const r = checkExceedMax(3, 2, 5);
    expect(r.exceeds).toBe(false);
    expect(r.remaining).toBe(2);
  });

  it('reports exceed when current+add > max', () => {
    const r = checkExceedMax(4, 3, 5);
    expect(r.exceeds).toBe(true);
    expect(r.remaining).toBe(1);
    expect(r.message).toMatch(/已超过/);
  });

  it('treats null/undefined max as unlimited', () => {
    expect(checkExceedMax(99, 100, null).exceeds).toBe(false);
    expect(checkExceedMax(99, 100, undefined).exceeds).toBe(false);
    expect(checkExceedMax(99, 100, Number.POSITIVE_INFINITY).exceeds).toBe(false);
  });

  it('treats negative current/add as zero', () => {
    const r = checkExceedMax(-5 as unknown as number, -3 as unknown as number, 10);
    expect(r.exceeds).toBe(false);
    expect(r.remaining).toBe(10);
  });

  it('caps remaining at 0 when already over', () => {
    const r = checkExceedMax(8, 1, 5);
    expect(r.exceeds).toBe(true);
    expect(r.remaining).toBe(0);
  });
});

describe('wouldExceedMax', () => {
  it('mirrors checkExceedMax.exceeds', () => {
    expect(wouldExceedMax(3, 2, 5)).toBe(false);
    expect(wouldExceedMax(3, 3, 5)).toBe(true);
  });
});

describe('formatExceedMaxMessage', () => {
  it('includes current / add / max / remaining in the message', () => {
    const msg = formatExceedMaxMessage(4, 3, 5, 1);
    expect(msg).toContain('4');
    expect(msg).toContain('3');
    expect(msg).toContain('5');
    expect(msg).toContain('1');
  });
});
