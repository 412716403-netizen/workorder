import { describe, expect, it, vi } from 'vitest';
import { accumulateMeasuredWeightByProduct } from './scanMeasuredWeightByProduct';
import type { ScanPayload } from './scanPayload';

describe('accumulateMeasuredWeightByProduct', () => {
  it('sums row weights by resolved productId', async () => {
    const payloads: ScanPayload[] = [
      { kind: 'ITEM', token: 'a', raw: 'a' },
      { kind: 'ITEM', token: 'b', raw: 'b' },
      { kind: 'ITEM', token: 'c', raw: 'c' },
    ];
    const resolve = vi.fn(async (p: ScanPayload) => {
      if (p.token === 'a') return 'p1';
      if (p.token === 'b') return 'p2';
      if (p.token === 'c') return 'p1';
      return null;
    });
    const map = await accumulateMeasuredWeightByProduct(
      payloads,
      { totalMeasuredWeightKg: 15, hasWeightWarning: false, rowMeasuredWeightKg: [5, 4, 6] },
      resolve,
    );
    expect(map.get('p1')).toBe(11);
    expect(map.get('p2')).toBe(4);
  });
});
