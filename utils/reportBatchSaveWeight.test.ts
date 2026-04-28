import { describe, it, expect } from 'vitest';
import { reportBatchRowWeightForPayload } from './reportBatchSaveWeight';

describe('reportBatchRowWeightForPayload', () => {
  it('matrix + cleared batch total returns null so backend clears weight', () => {
    expect(
      reportBatchRowWeightForPayload({
        usesWeight: true,
        isMatrix: true,
        batchTotalWeightKg: '',
        distributedParts: null,
        rowIndex: 0,
        rowWeightKg: 5,
      }),
    ).toBeNull();
  });

  it('matrix + numeric total uses distributed part', () => {
    expect(
      reportBatchRowWeightForPayload({
        usesWeight: true,
        isMatrix: true,
        batchTotalWeightKg: 100,
        distributedParts: [10, 20, 70],
        rowIndex: 1,
        rowWeightKg: '',
      }),
    ).toBe(20);
  });

  it('non-matrix empty row weight is null', () => {
    expect(
      reportBatchRowWeightForPayload({
        usesWeight: true,
        isMatrix: false,
        batchTotalWeightKg: '',
        distributedParts: null,
        rowIndex: 0,
        rowWeightKg: '',
      }),
    ).toBeNull();
  });

  it('returns undefined when weight not used', () => {
    expect(
      reportBatchRowWeightForPayload({
        usesWeight: false,
        isMatrix: true,
        batchTotalWeightKg: '',
        distributedParts: null,
        rowIndex: 0,
        rowWeightKg: '',
      }),
    ).toBeUndefined();
  });
});
