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

  it('continues numbering across pages using per-batch base offset', () => {
    // 第 2 页：批次 b1 本页之前已有 5 件，应从 6 起编号而非重新从 1
    const base = new Map<string, number>([['b1', 5]]);
    const rows = attachBatchPieceNos(
      [
        { batchId: 'b1', serialNo: 16, batchPieceNo: null },
        { batchId: 'b1', serialNo: 18, batchPieceNo: null },
        { batchId: 'b1', serialNo: 17, batchPieceNo: null },
      ],
      base,
    );
    expect(rows.find((r) => r.serialNo === 16)?.batchPieceNo).toBe(6);
    expect(rows.find((r) => r.serialNo === 17)?.batchPieceNo).toBe(7);
    expect(rows.find((r) => r.serialNo === 18)?.batchPieceNo).toBe(8);
  });
});
