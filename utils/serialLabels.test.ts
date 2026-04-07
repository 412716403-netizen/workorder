import { describe, it, expect } from 'vitest';
import { formatItemCodeSerialLabel, formatBatchSerialLabel } from './serialLabels';

describe('formatItemCodeSerialLabel', () => {
  it('formats with zero-padded serial number', () => {
    expect(formatItemCodeSerialLabel('PLN12', 1)).toBe('J-PLN12-0001');
  });

  it('handles large serial numbers', () => {
    expect(formatItemCodeSerialLabel('PLN12', 9999)).toBe('J-PLN12-9999');
  });

  it('pads to 4 digits', () => {
    expect(formatItemCodeSerialLabel('PLN5', 42)).toBe('J-PLN5-0042');
  });
});

describe('formatBatchSerialLabel', () => {
  it('uses B prefix instead of J', () => {
    expect(formatBatchSerialLabel('PLN12', 3)).toBe('B-PLN12-0003');
  });

  it('handles large sequence numbers', () => {
    expect(formatBatchSerialLabel('PLN1', 10000)).toBe('B-PLN1-10000');
  });
});
