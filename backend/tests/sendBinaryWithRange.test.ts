import { describe, expect, it } from 'vitest';
import { parseBytesRangeHeader } from '../src/utils/sendBinaryWithRange.js';

describe('parseBytesRangeHeader', () => {
  it('parses start-end range', () => {
    expect(parseBytesRangeHeader('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseBytesRangeHeader('bytes=10-', 100)).toEqual({ start: 10, end: 99 });
  });

  it('parses suffix range', () => {
    expect(parseBytesRangeHeader('bytes=-20', 100)).toEqual({ start: 80, end: 99 });
  });

  it('rejects invalid ranges', () => {
    expect(parseBytesRangeHeader(undefined, 100)).toBeNull();
    expect(parseBytesRangeHeader('bytes=200-300', 100)).toBeNull();
    expect(parseBytesRangeHeader('bytes=20-10', 100)).toBeNull();
  });
});
