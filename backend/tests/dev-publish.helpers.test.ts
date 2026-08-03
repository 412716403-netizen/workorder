import { describe, it, expect } from 'vitest';
import {
  resolveProductVariantIdsForDevBom,
  asNodeBomsRecord,
} from '../src/services/dev-publish.helpers.js';

describe('resolveProductVariantIdsForDevBom', () => {
  it('maps a real variant bom to one product variant', () => {
    const map = new Map([['dv1', 'pv1'], ['dv2', 'pv2']]);
    expect(
      resolveProductVariantIdsForDevBom(
        'style1',
        [{ id: 'dv1' }, { id: 'dv2' }],
        true,
        map,
        'pv1',
        'dv2',
      ),
    ).toEqual(['pv2']);
  });

  it('fans out single-sku bom to all real variants', () => {
    const map = new Map([['dv1', 'pv1'], ['dv2', 'pv2']]);
    expect(
      resolveProductVariantIdsForDevBom(
        'style1',
        [{ id: 'dv1' }, { id: 'dv2' }],
        true,
        map,
        'pv1',
        `dvar-single-style1`,
      ),
    ).toEqual(['pv1', 'pv2']);
  });

  it('returns null when mapped product variant is missing', () => {
    const map = new Map([['dv1', 'pv1']]);
    expect(
      resolveProductVariantIdsForDevBom(
        'style1',
        [{ id: 'dv1' }],
        true,
        map,
        'pv1',
        'dv-missing',
      ),
    ).toBeNull();
  });
});

describe('asNodeBomsRecord', () => {
  it('drops empty keys and values', () => {
    expect(asNodeBomsRecord({ a: '1', '': 'x', b: '', c: ' 2 ' })).toEqual({
      a: '1',
      c: '2',
    });
  });
});
