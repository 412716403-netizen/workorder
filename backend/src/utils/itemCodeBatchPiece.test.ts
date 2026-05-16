import { describe, expect, it } from 'vitest';
import { attachBatchPieceNos } from './itemCodeBatchPiece.js';

describe('attachBatchPieceNos', () => {
  it('assigns 1..n by serialNo within each batch', () => {
    const rows = attachBatchPieceNos([
      { batchId: 'b1', serialNo: 10, batchPieceNo: null },
      { batchId: 'b1', serialNo: 8, batchPieceNo: null },
      { batchId: 'b2', serialNo: 3, batchPieceNo: null },
    ]);
    expect(rows.find((r) => r.serialNo === 8)?.batchPieceNo).toBe(1);
    expect(rows.find((r) => r.serialNo === 10)?.batchPieceNo).toBe(2);
    expect(rows.find((r) => r.batchId === 'b2')?.batchPieceNo).toBe(1);
  });

  it('keeps existing batchPieceNo when set', () => {
    const rows = attachBatchPieceNos([{ batchId: 'b1', serialNo: 1, batchPieceNo: 5 }]);
    expect(rows[0]?.batchPieceNo).toBe(5);
  });
});
