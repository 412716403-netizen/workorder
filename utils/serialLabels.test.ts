import { describe, it, expect } from 'vitest';
import {
  formatBatchSerialLabel,
  formatItemCodeSerialLabel,
  formatItemCodeSerialLabelFromCode,
} from './serialLabels';

describe('formatItemCodeSerialLabel', () => {
  it('formats batch-linked code as plan-batchSeq-pieceNo without padding', () => {
    expect(
      formatItemCodeSerialLabel('PLN47', 99, { batchSequenceNo: 1, batchPieceNo: 1 }),
    ).toBe('PLN47-1-1');
    expect(
      formatItemCodeSerialLabel('PLN12', 99, { batchSequenceNo: 3, batchPieceNo: 2 }),
    ).toBe('PLN12-3-2');
  });

  it('falls back to plan-global serial when no batch', () => {
    expect(formatItemCodeSerialLabel('PLN47', 1)).toBe('PLN47-1');
    expect(formatItemCodeSerialLabel('PLN12', 9999)).toBe('PLN12-9999');
  });
});

describe('formatItemCodeSerialLabelFromCode', () => {
  it('uses batch on code row', () => {
    expect(
      formatItemCodeSerialLabelFromCode('PLN47', {
        serialNo: 50,
        batchPieceNo: 5,
        batch: { sequenceNo: 2 },
      }),
    ).toBe('PLN47-2-5');
  });
});

describe('formatBatchSerialLabel', () => {
  it('uses planNumber-sequenceNo without B prefix or padding', () => {
    expect(formatBatchSerialLabel('PLN47', 1)).toBe('PLN47-1');
    expect(formatBatchSerialLabel('PLN12', 3)).toBe('PLN12-3');
  });

  it('handles large sequence numbers', () => {
    expect(formatBatchSerialLabel('PLN1', 10000)).toBe('PLN1-10000');
  });
});
