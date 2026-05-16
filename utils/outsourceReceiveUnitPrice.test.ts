import { describe, it, expect } from 'vitest';
import {
  outsourceReceiveBaseKey,
  resolveOutsourceReceiveLineUnitPrice,
  propagateLineUnitPriceToEntries,
} from './outsourceReceiveUnitPrice';

describe('outsourceReceiveBaseKey', () => {
  it('variant entry → line base', () => {
    expect(outsourceReceiveBaseKey('ord1|node1|varA')).toBe('ord1|node1');
  });
  it('line entry unchanged', () => {
    expect(outsourceReceiveBaseKey('ord1|node1')).toBe('ord1|node1');
  });
});

describe('resolveOutsourceReceiveLineUnitPrice', () => {
  it('prefers entry key then base key', () => {
    expect(resolveOutsourceReceiveLineUnitPrice({ 'a|n|v': 3, 'a|n': 5 }, 'a|n|v')).toBe(3);
    expect(resolveOutsourceReceiveLineUnitPrice({ 'a|n': 5 }, 'a|n|v', 'a|n')).toBe(5);
  });
  it('invalid → undefined', () => {
    expect(resolveOutsourceReceiveLineUnitPrice({}, 'a|n|v', 'a|n')).toBeUndefined();
  });
});

describe('propagateLineUnitPriceToEntries', () => {
  it('sets line + variant keys', () => {
    const r = propagateLineUnitPriceToEntries({}, 'o|n', 12, ['o|n|v1', 'o|n|v2', 'x|n']);
    expect(r['o|n']).toBe(12);
    expect(r['o|n|v1']).toBe(12);
    expect(r['o|n|v2']).toBe(12);
    expect(r['x|n']).toBeUndefined();
  });
});
