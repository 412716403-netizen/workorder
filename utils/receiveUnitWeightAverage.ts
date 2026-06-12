import type { ReceiveUnitWeightAverageRow } from '../types';

export function receiveUnitWeightAverageMap(
  rows: ReceiveUnitWeightAverageRow[],
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const row of rows) {
    if (row.avgUnitWeightKg > 0 && Number.isFinite(row.avgUnitWeightKg)) {
      next[`${row.variantId}:${row.nodeId}`] = row.avgUnitWeightKg;
    }
  }
  return next;
}
