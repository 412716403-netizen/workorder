import { describe, it, expect } from 'vitest';
import { buildProductBomChildIndex } from './devMaterialTree';
import { buildProductBomExpandLines } from './productBomExpand';
import type { BOM } from '../types';

function bom(
  parentProductId: string,
  items: Array<{ productId: string; quantity: number }>,
  id = `bom-${parentProductId}`,
): BOM {
  return {
    id,
    name: id,
    parentProductId,
    version: '1',
    items,
  };
}

describe('buildProductBomExpandLines', () => {
  it('flattens top-level items and expands nested children by key', () => {
    const { childrenByParent, unitQtyByParentChild } = buildProductBomChildIndex([
      bom('m1', [{ productId: 'c1', quantity: 2 }, { productId: 'c2', quantity: 0.5 }]),
      bom('c1', [{ productId: 'g1', quantity: 3 }]),
    ]);
    const topItems = [
      { productId: 'm1', quantity: 1.2 },
      { productId: 'm2', quantity: 4 },
    ];

    const collapsed = buildProductBomExpandLines(
      topItems,
      'root-bom',
      childrenByParent,
      unitQtyByParentChild,
      new Set(),
    );
    expect(collapsed.map((r) => ({ key: r.rowKey, hasChildren: r.hasChildren, qty: r.quantity }))).toEqual([
      { key: 'root-bom:m1', hasChildren: true, qty: 1.2 },
      { key: 'root-bom:m2', hasChildren: false, qty: 4 },
    ]);

    const expanded = buildProductBomExpandLines(
      topItems,
      'root-bom',
      childrenByParent,
      unitQtyByParentChild,
      new Set(['root-bom:m1', 'root-bom:m1/c1']),
    );
    expect(expanded.map((r) => ({ key: r.rowKey, level: r.level, qty: r.quantity }))).toEqual([
      { key: 'root-bom:m1', level: 1, qty: 1.2 },
      { key: 'root-bom:m1/c1', level: 2, qty: 2 },
      { key: 'root-bom:m1/c1/g1', level: 3, qty: 3 },
      { key: 'root-bom:m1/c2', level: 2, qty: 0.5 },
      { key: 'root-bom:m2', level: 1, qty: 4 },
    ]);
  });

  it('breaks cycles without infinite expansion', () => {
    const { childrenByParent, unitQtyByParentChild } = buildProductBomChildIndex([
      bom('a', [{ productId: 'b', quantity: 1 }]),
      bom('b', [{ productId: 'a', quantity: 1 }]),
    ]);
    const rows = buildProductBomExpandLines(
      [{ productId: 'a', quantity: 1 }],
      'bom',
      childrenByParent,
      unitQtyByParentChild,
      new Set(['bom:a', 'bom:a/b']),
    );
    expect(rows.map((r) => r.rowKey)).toEqual(['bom:a', 'bom:a/b', 'bom:a/b/a']);
    expect(rows[2].hasChildren).toBe(false);
  });
});
