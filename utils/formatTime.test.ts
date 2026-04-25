import { describe, it, expect } from 'vitest';
import { formatTimestamp, fmtDT } from './formatTime';

describe('formatTimestamp', () => {
  it('returns "—" for undefined', () => {
    expect(formatTimestamp(undefined)).toBe('—');
  });

  it('returns original string for invalid date', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });

  it('formats valid ISO string to yyyy-MM-dd HH:mm', () => {
    const result = formatTimestamp('2024-03-15T10:30:00Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('fmtDT', () => {
  it('returns "—" for null', () => {
    expect(fmtDT(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(fmtDT(undefined)).toBe('—');
  });

  it('returns "—" for empty string', () => {
    expect(fmtDT('')).toBe('—');
  });

  it('returns original string for invalid date', () => {
    expect(fmtDT('garbage')).toBe('garbage');
  });

  it('formats valid Date object', () => {
    const d = new Date('2024-06-15T08:30:45Z');
    const result = fmtDT(d);
    expect(result).toContain('2024');
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{2}|\d{4}\/\d{1,2}\/\d{1,2}/);
  });

  it('formats valid ISO string', () => {
    const result = fmtDT('2024-03-15T10:30:00Z');
    expect(result).toContain('2024');
  });
});
