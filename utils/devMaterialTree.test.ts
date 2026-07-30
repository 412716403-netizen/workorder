import { describe, it, expect } from 'vitest';
import { DEV_MATERIAL_BOM_MAX_DEPTH } from '../shared/types';
import type { BOM } from '../types';
import {
  buildProductChildrenIndex,
  buildDevMaterialTree,
  buildRootCoverageIndex,
  flattenVisibleRows,
  collectTreeProductIds,
  collectDescendantProductIds,
  resolveTopLevelRootIds,
} from './devMaterialTree';

function bom(parentProductId: string, childIds: string[], id = `bom-${parentProductId}`): BOM {
  return {
    id,
    name: id,
    parentProductId,
    version: '1',
    items: childIds.map((productId) => ({ productId, quantity: 1 })),
  };
}

describe('buildProductChildrenIndex', () => {
  it('aggregates children across variants/nodes and dedupes in order', () => {
    const index = buildProductChildrenIndex([
      bom('p1', ['c1', 'c2'], 'b1'),
      bom('p1', ['c2', 'c3'], 'b2'),
      bom('p2', ['c4'], 'b3'),
    ]);
    expect(index.get('p1')).toEqual(['c1', 'c2', 'c3']);
    expect(index.get('p2')).toEqual(['c4']);
  });
});

describe('buildDevMaterialTree + flattenVisibleRows', () => {
  it('builds multilevel tree and flattens by expanded keys', () => {
    const index = buildProductChildrenIndex([
      bom('m1', ['c1', 'c2']),
      bom('c1', ['g1']),
    ]);
    const tree = buildDevMaterialTree(['m1', 'm2'], index);
    expect(tree).toHaveLength(2);
    expect(tree[0].children.map((c) => c.productId)).toEqual(['c1', 'c2']);
    expect(tree[0].children[0].children.map((c) => c.productId)).toEqual(['g1']);
    expect(tree[1].children).toEqual([]);

    const collapsed = flattenVisibleRows(tree, new Set());
    expect(collapsed.map((r) => r.rowKey)).toEqual(['m1', 'm2']);
    expect(collapsed[0].hasChildren).toBe(true);
    expect(collapsed[1].hasChildren).toBe(false);

    const expanded = flattenVisibleRows(tree, new Set(['m1', 'm1/c1']));
    expect(expanded.map((r) => ({ key: r.rowKey, level: r.level }))).toEqual([
      { key: 'm1', level: 1 },
      { key: 'm1/c1', level: 2 },
      { key: 'm1/c1/g1', level: 3 },
      { key: 'm1/c2', level: 2 },
      { key: 'm2', level: 1 },
    ]);
  });

  it('breaks cyclic BOM without infinite recursion', () => {
    const index = buildProductChildrenIndex([
      bom('a', ['b']),
      bom('b', ['a']),
    ]);
    const tree = buildDevMaterialTree(['a'], index);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].productId).toBe('b');
    // b -> a appears once but a under b has no further children (cycle cut)
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].productId).toBe('a');
    expect(tree[0].children[0].children[0].children).toEqual([]);
  });

  it('stops expanding at DEV_MATERIAL_BOM_MAX_DEPTH', () => {
    const boms: BOM[] = [];
    for (let i = 1; i < DEV_MATERIAL_BOM_MAX_DEPTH + 3; i++) {
      boms.push(bom(`n${i}`, [`n${i + 1}`]));
    }
    const index = buildProductChildrenIndex(boms);
    const tree = buildDevMaterialTree(['n1'], index);
    let node = tree[0];
    let depth = 1;
    while (node.children.length > 0) {
      node = node.children[0];
      depth += 1;
    }
    expect(depth).toBe(DEV_MATERIAL_BOM_MAX_DEPTH);
    expect(node.productId).toBe(`n${DEV_MATERIAL_BOM_MAX_DEPTH}`);
  });
});

describe('collectTreeProductIds / collectDescendantProductIds', () => {
  it('collects unique ids in tree order', () => {
    const index = buildProductChildrenIndex([
      bom('m1', ['c1']),
      bom('m2', ['c1', 'c2']),
    ]);
    const tree = buildDevMaterialTree(['m1', 'm2'], index);
    expect(collectTreeProductIds(tree)).toEqual(['m1', 'c1', 'm2', 'c2']);
  });

  it('collects descendants excluding roots', () => {
    const index = buildProductChildrenIndex([
      bom('m1', ['c1']),
      bom('c1', ['g1']),
    ]);
    expect([...collectDescendantProductIds(['m1'], index)].sort()).toEqual(['c1', 'g1']);
  });
});

describe('resolveTopLevelRootIds', () => {
  it('drops roots that are descendants of another root', () => {
    const index = buildProductChildrenIndex([
      bom('m1', ['c1']),
      bom('c1', ['g1']),
    ]);
    expect(resolveTopLevelRootIds(['m1', 'c1', 'g1', 'm2'], index)).toEqual(['m1', 'm2']);
  });

  it('dedupes and trims ids', () => {
    const index = buildProductChildrenIndex([]);
    expect(resolveTopLevelRootIds([' m1 ', 'm1', '', 'm2'], index)).toEqual(['m1', 'm2']);
  });

  it('keeps the first root when two roots are mutually reachable', () => {
    const index = buildProductChildrenIndex([
      bom('a', ['b']),
      bom('b', ['a']),
    ]);
    expect(resolveTopLevelRootIds(['a', 'b'], index)).toEqual(['a']);
    expect(resolveTopLevelRootIds(['b', 'a'], index)).toEqual(['b']);
  });
});

describe('buildRootCoverageIndex', () => {
  it('maps every product to the roots whose subtree contains it', () => {
    const index = buildProductChildrenIndex([
      bom('m1', ['c1']),
      bom('c1', ['shared']),
      bom('m2', ['shared']),
    ]);
    const coverage = buildRootCoverageIndex(['m1', 'm2'], index);
    expect([...(coverage.get('m1') ?? [])]).toEqual(['m1']);
    expect([...(coverage.get('c1') ?? [])]).toEqual(['m1']);
    expect([...(coverage.get('shared') ?? [])].sort()).toEqual(['m1', 'm2']);
    expect(coverage.has('unrelated')).toBe(false);
  });
});
