import { describe, it, expect } from 'vitest';
import { filterPrintTemplatesByAllowedIds } from './printTemplateWhitelist';
import type { PrintTemplate } from '../types';

const tpl = (id: string): PrintTemplate => ({
  id,
  name: id,
  paperSize: { widthMm: 80, heightMm: 60 },
  elements: [],
  createdAt: '',
  updatedAt: '',
  documentType: 'plan',
});

describe('filterPrintTemplatesByAllowedIds', () => {
  const all = [tpl('a'), tpl('b'), tpl('c')];

  it('returns empty when whitelist is undefined or empty', () => {
    expect(filterPrintTemplatesByAllowedIds(all, undefined)).toEqual([]);
    expect(filterPrintTemplatesByAllowedIds(all, [])).toEqual([]);
  });

  it('returns only whitelisted templates', () => {
    expect(filterPrintTemplatesByAllowedIds(all, ['b', 'ghost'])).toEqual([tpl('b')]);
  });

  it('trims id strings in whitelist', () => {
    expect(filterPrintTemplatesByAllowedIds(all, [' a ', 'b'])).toEqual([tpl('a'), tpl('b')]);
  });
});
