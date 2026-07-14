import { describe, expect, it } from 'vitest';
import { latestDefectiveReportMs } from './latestDefectiveReportMs';

describe('latestDefectiveReportMs', () => {
  it('returns 0 for empty reports', () => {
    expect(latestDefectiveReportMs(undefined)).toBe(0);
    expect(latestDefectiveReportMs([])).toBe(0);
  });

  it('ignores reports without defective qty', () => {
    expect(
      latestDefectiveReportMs([
        { timestamp: '2026-07-14T10:00:00.000Z', defectiveQuantity: 0 },
        { timestamp: '2026-07-14T12:00:00.000Z' },
      ])
    ).toBe(0);
  });

  it('returns the newest defective report timestamp', () => {
    const older = Date.parse('2026-07-13T08:00:00.000Z');
    const newer = Date.parse('2026-07-14T09:30:00.000Z');
    expect(
      latestDefectiveReportMs([
        { timestamp: '2026-07-13T08:00:00.000Z', defectiveQuantity: 2 },
        { timestamp: '2026-07-14T09:30:00.000Z', defectiveQuantity: 1 },
        { timestamp: '2026-07-12T20:00:00.000Z', defectiveQuantity: 9 },
      ])
    ).toBe(newer);
    expect(newer).toBeGreaterThan(older);
  });
});
