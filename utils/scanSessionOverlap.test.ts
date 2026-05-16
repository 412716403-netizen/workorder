import { describe, it, expect } from 'vitest';
import { checkScanSessionOverlap, type ScanSessionState } from './scanSessionOverlap';

function state(partial?: Partial<{
  itemCodeIds: Iterable<string>;
  batchScannedIds: Iterable<string>;
  itemParentBatchIds: Iterable<string>;
}>): ScanSessionState {
  return {
    itemCodeIds: new Set(partial?.itemCodeIds ?? []),
    batchScannedIds: new Set(partial?.batchScannedIds ?? []),
    itemParentBatchIds: new Set(partial?.itemParentBatchIds ?? []),
  };
}

describe('checkScanSessionOverlap', () => {
  it('allows scanning a fresh BATCH not yet in session', () => {
    const r = checkScanSessionOverlap(state(), { kind: 'BATCH', virtualBatchId: 'b1' });
    expect(r.overlaps).toBe(false);
  });

  it('rejects scanning a BATCH that is already scanned as BATCH', () => {
    const r = checkScanSessionOverlap(state({ batchScannedIds: ['b1'] }), {
      kind: 'BATCH',
      virtualBatchId: 'b1',
    });
    expect(r.overlaps).toBe(true);
    expect(r.reason).toBe('BATCH_ALREADY_SCANNED');
  });

  it('rejects scanning a BATCH when one of its child items was already scanned', () => {
    const r = checkScanSessionOverlap(state({ itemParentBatchIds: ['b1'] }), {
      kind: 'BATCH',
      virtualBatchId: 'b1',
    });
    expect(r.overlaps).toBe(true);
    expect(r.reason).toBe('BATCH_CONTAINS_SCANNED_ITEM');
  });

  it('rejects scanning an ITEM whose parent BATCH was already scanned as BATCH', () => {
    const r = checkScanSessionOverlap(state({ batchScannedIds: ['b1'] }), {
      kind: 'ITEM',
      itemCodeId: 'i-99',
      virtualBatchId: 'b1',
    });
    expect(r.overlaps).toBe(true);
    expect(r.reason).toBe('ITEM_PARENT_BATCH_SCANNED');
  });

  it('rejects scanning an ITEM that is already in session', () => {
    const r = checkScanSessionOverlap(state({ itemCodeIds: ['i-1'] }), {
      kind: 'ITEM',
      itemCodeId: 'i-1',
      virtualBatchId: 'b1',
    });
    expect(r.overlaps).toBe(true);
    expect(r.reason).toBe('ITEM_ALREADY_SCANNED');
  });

  it('allows multiple distinct items of the same parent batch when batch itself not scanned', () => {
    // i-1 已在会话且其父批次 b1 仅作为 ITEM_PARENT 引用 —— 仍可加入 i-2（同父批次的另一单品）
    const r = checkScanSessionOverlap(
      state({ itemCodeIds: ['i-1'], itemParentBatchIds: ['b1'] }),
      { kind: 'ITEM', itemCodeId: 'i-2', virtualBatchId: 'b1' },
    );
    expect(r.overlaps).toBe(false);
  });

  it('allows scanning an unrelated ITEM in a clean session', () => {
    const r = checkScanSessionOverlap(state(), {
      kind: 'ITEM',
      itemCodeId: 'i-1',
      virtualBatchId: 'b1',
    });
    expect(r.overlaps).toBe(false);
  });

  it('does not flag UNKNOWN payload regardless of state', () => {
    const r = checkScanSessionOverlap(state({ batchScannedIds: ['b1'] }), {
      kind: 'UNKNOWN',
      itemCodeId: 'i-1',
      virtualBatchId: 'b1',
    });
    expect(r.overlaps).toBe(false);
  });

  it('reproduces the user scenario: PLN47-1 batch then PLN47-1-1 item must be rejected', () => {
    // 先扫批次 PLN47-1（10 件） → batchScannedIds = { b-PLN47-1 }
    let s = state({ batchScannedIds: ['b-PLN47-1'] });
    // 再扫单品 PLN47-1-1（属于该批次）
    const r = checkScanSessionOverlap(s, {
      kind: 'ITEM',
      itemCodeId: 'i-PLN47-1-1',
      virtualBatchId: 'b-PLN47-1',
    });
    expect(r.overlaps).toBe(true);
    expect(r.reason).toBe('ITEM_PARENT_BATCH_SCANNED');
    expect(r.message).toContain('该单品所在批次已在列表中');
  });
});
