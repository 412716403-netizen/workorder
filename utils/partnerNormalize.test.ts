import { describe, expect, it } from 'vitest';
import { findPartnerByName, partnerNameKey } from './partnerNormalize';
import type { Partner } from '../types';

const partners: Partner[] = [
  { id: 'p1', name: '横机好俏', contact: '', categoryId: 'c1', partnerListNo: 5 },
  { id: 'p2', name: '万新', contact: '', categoryId: 'c1', partnerListNo: 6 },
];

describe('partnerNameKey', () => {
  it('trims and lowercases', () => {
    expect(partnerNameKey('  ABC  ')).toBe('abc');
  });
});

describe('findPartnerByName', () => {
  it('matches case-insensitively', () => {
    expect(findPartnerByName(partners, '横机好俏')?.id).toBe('p1');
    expect(findPartnerByName(partners, ' 横机好俏 ')?.id).toBe('p1');
  });

  it('excludes self when editing', () => {
    expect(findPartnerByName(partners, '横机好俏', 'p1')).toBeUndefined();
  });

  it('detects conflict with another record', () => {
    expect(findPartnerByName(partners, '万新', 'p1')?.id).toBe('p2');
  });
});
