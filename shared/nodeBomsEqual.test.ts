import { describe, expect, it } from 'vitest';
import { nodeBomsMapsEqual } from '../shared/nodeBomsEqual';

describe('nodeBomsMapsEqual', () => {
  it('treats same map with different key order as equal', () => {
    expect(
      nodeBomsMapsEqual(
        { n2: 'bom-2', n1: 'bom-1' },
        { n1: 'bom-1', n2: 'bom-2' },
      ),
    ).toBe(true);
  });

  it('ignores empty keys and values', () => {
    expect(
      nodeBomsMapsEqual(
        { n1: 'bom-1', '': 'x', n2: '' },
        { n1: 'bom-1' },
      ),
    ).toBe(true);
  });

  it('detects value mismatch', () => {
    expect(nodeBomsMapsEqual({ n1: 'bom-1' }, { n1: 'bom-2' })).toBe(false);
  });

  it('handles nullish', () => {
    expect(nodeBomsMapsEqual(null, {})).toBe(true);
    expect(nodeBomsMapsEqual(undefined, null)).toBe(true);
    expect(nodeBomsMapsEqual({ n1: 'a' }, null)).toBe(false);
  });
});
