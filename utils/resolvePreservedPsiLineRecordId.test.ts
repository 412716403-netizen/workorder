import { describe, expect, it } from 'vitest';
import { resolvePreservedPsiLineRecordId } from './resolvePreservedPsiLineRecordId';

describe('resolvePreservedPsiLineRecordId', () => {
  const records = [
    { id: 'po-a', type: 'PURCHASE_ORDER', variantId: undefined },
    { id: 'po-s', type: 'PURCHASE_ORDER', variantId: 'v-s' },
    { id: 'po-m', type: 'PURCHASE_ORDER', variantId: 'v-m' },
  ];

  it('returns fallback when no source ids', () => {
    const used = new Set<string>();
    expect(
      resolvePreservedPsiLineRecordId({
        type: 'PURCHASE_ORDER',
        sourceRecordIds: undefined,
        variantId: undefined,
        records,
        usedIds: used,
        fallbackId: 'new-1',
      }),
    ).toBe('new-1');
  });

  it('reuses matching non-variant id', () => {
    const used = new Set<string>();
    expect(
      resolvePreservedPsiLineRecordId({
        type: 'PURCHASE_ORDER',
        sourceRecordIds: ['po-a'],
        variantId: undefined,
        records,
        usedIds: used,
        fallbackId: 'new-1',
      }),
    ).toBe('po-a');
    expect(used.has('po-a')).toBe(true);
  });

  it('reuses matching variant id and does not reuse twice', () => {
    const used = new Set<string>();
    expect(
      resolvePreservedPsiLineRecordId({
        type: 'PURCHASE_ORDER',
        sourceRecordIds: ['po-s', 'po-m'],
        variantId: 'v-s',
        records,
        usedIds: used,
        fallbackId: 'new-1',
      }),
    ).toBe('po-s');
    expect(
      resolvePreservedPsiLineRecordId({
        type: 'PURCHASE_ORDER',
        sourceRecordIds: ['po-s', 'po-m'],
        variantId: 'v-s',
        records,
        usedIds: used,
        fallbackId: 'new-2',
      }),
    ).toBe('new-2');
  });
});
