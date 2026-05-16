import { describe, expect, it } from 'vitest';
import { scanItemResultToRowDetail, scanVirtualBatchResultToRowDetail } from './scanBatchRowDetail';
import type { ScanItemCodeResult, ScanVirtualBatchResult } from '../types';

describe('scanBatchRowDetail codeLabel', () => {
  it('shows item serial on product name row', () => {
    const row = scanItemResultToRowDetail({
      kind: 'ITEM_CODE',
      status: 'ACTIVE',
      productName: '毛衣15',
      planNumber: 'PLN47',
      serialNo: 99,
      batchSequenceNo: 2,
      batchPieceNo: 1,
    } as ScanItemCodeResult);
    expect(row.codeLabel).toBe('PLN47-2-1');
    expect(row.productName).toBe('毛衣15');
  });

  it('shows batch serial on product name row', () => {
    const row = scanVirtualBatchResultToRowDetail({
      kind: 'VIRTUAL_BATCH',
      status: 'ACTIVE',
      productName: '毛衣15',
      planNumber: 'PLN47',
      sequenceNo: 2,
    } as ScanVirtualBatchResult);
    expect(row.codeLabel).toBe('PLN47-2');
    expect(row.productName).toBe('毛衣15');
  });

  it('prefers server serialLabel when provided', () => {
    const row = scanVirtualBatchResultToRowDetail({
      kind: 'VIRTUAL_BATCH',
      status: 'ACTIVE',
      productName: '毛衣15',
      serialLabel: 'PLN47-2',
    } as ScanVirtualBatchResult);
    expect(row.codeLabel).toBe('PLN47-2');
  });
});
