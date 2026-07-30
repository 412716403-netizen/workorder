import { describe, it, expect } from 'vitest';
import type { BOM } from '../types';
import { findBomParentProductIds } from './bomWhereUsed';

function bom(partial: Partial<BOM> & Pick<BOM, 'id' | 'parentProductId' | 'items'>): BOM {
  return {
    name: partial.name ?? 'BOM',
    version: partial.version ?? '1',
    variantId: partial.variantId,
    nodeId: partial.nodeId,
    ...partial,
  };
}

describe('findBomParentProductIds', () => {
  it('returns empty when no boms reference the material', () => {
    const boms = [
      bom({ id: 'b1', parentProductId: 'p-a', items: [{ productId: 'other', quantity: 1 }] }),
    ];
    expect(findBomParentProductIds(boms, 'mat-1')).toEqual([]);
  });

  it('returns empty for blank material id', () => {
    expect(findBomParentProductIds([], '')).toEqual([]);
    expect(findBomParentProductIds([], '  ')).toEqual([]);
  });

  it('finds the parent product of a referencing bom', () => {
    const boms = [
      bom({
        id: 'b1',
        name: '裁剪 BOM',
        parentProductId: 'p-a',
        variantId: 'v1',
        nodeId: 'n1',
        items: [{ productId: 'mat-1', quantity: 2, note: '主料' }],
      }),
    ];
    expect(findBomParentProductIds(boms, 'mat-1')).toEqual(['p-a']);
  });

  it('dedupes a parent referenced by multiple variants/nodes', () => {
    const boms = [
      bom({
        id: 'b1',
        parentProductId: 'p-a',
        variantId: 'v1',
        items: [{ productId: 'mat-1', quantity: 1 }],
      }),
      bom({
        id: 'b2',
        parentProductId: 'p-a',
        variantId: 'v2',
        items: [{ productId: 'mat-1', quantity: 3 }],
      }),
    ];
    expect(findBomParentProductIds(boms, 'mat-1')).toEqual(['p-a']);
  });

  it('dedupes a parent referencing the material twice in one bom', () => {
    const boms = [
      bom({
        id: 'b1',
        parentProductId: 'p-a',
        items: [
          { productId: 'mat-1', quantity: 1 },
          { productId: 'mat-1', quantity: 2 },
        ],
      }),
    ];
    expect(findBomParentProductIds(boms, 'mat-1')).toEqual(['p-a']);
  });

  it('returns multiple parents in bom order', () => {
    const boms = [
      bom({ id: 'b1', parentProductId: 'p-b', items: [{ productId: 'mat-1', quantity: 1 }] }),
      bom({ id: 'b2', parentProductId: 'p-a', items: [{ productId: 'mat-1', quantity: 2 }] }),
    ];
    expect(findBomParentProductIds(boms, 'mat-1')).toEqual(['p-b', 'p-a']);
  });

  it('excludes self-referencing parentProductId', () => {
    const boms = [
      bom({ id: 'b-self', parentProductId: 'mat-1', items: [{ productId: 'mat-1', quantity: 1 }] }),
      bom({ id: 'b-other', parentProductId: 'p-a', items: [{ productId: 'mat-1', quantity: 1 }] }),
    ];
    expect(findBomParentProductIds(boms, 'mat-1')).toEqual(['p-a']);
  });

  it('ignores blank productId on items', () => {
    const boms = [
      bom({
        id: 'b1',
        parentProductId: 'p-a',
        items: [
          { productId: '', quantity: 1 },
          { productId: '  ', quantity: 1 },
        ],
      }),
    ];
    expect(findBomParentProductIds(boms, 'mat-1')).toEqual([]);
  });

  it('ignores boms with blank parentProductId', () => {
    const boms = [
      bom({ id: 'b1', parentProductId: '  ', items: [{ productId: 'mat-1', quantity: 1 }] }),
    ];
    expect(findBomParentProductIds(boms, 'mat-1')).toEqual([]);
  });
});
