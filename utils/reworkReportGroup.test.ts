import { describe, it, expect } from 'vitest';
import {
  buildReworkReportPaths,
  groupReworkPathsByProduct,
  reworkQtyKey,
  parseReworkQtyKey,
  findReworkPathForScan,
  sumReworkEnteredForPath,
} from './reworkReportGroup';
import type { ProductionOpRecord, GlobalNodeTemplate } from '../types';

const nodeA = 'node-a';
const nodeB = 'node-b';
const globalNodes: GlobalNodeTemplate[] = [
  { id: nodeA, name: '工序A', reportTemplate: [] },
  { id: nodeB, name: '工序B', reportTemplate: [] },
];

function rework(overrides: Partial<ProductionOpRecord>): ProductionOpRecord {
  return {
    id: 'r1',
    type: 'REWORK',
    productId: 'p1',
    orderId: 'o1',
    quantity: 10,
    reworkNodeIds: [nodeA],
    status: '待处理',
    operator: '',
    timestamp: '',
    ...overrides,
  } as ProductionOpRecord;
}

describe('reworkReportGroup', () => {
  it('reworkQtyKey roundtrip', () => {
    expect(reworkQtyKey('p1', 'a|b', 'v1')).toBe('p1__a|b__v1');
    expect(parseReworkQtyKey('p1__a|b__v1')).toEqual({ productId: 'p1', pathKey: 'a|b', variantId: 'v1' });
    expect(parseReworkQtyKey('p1__node-a')).toEqual({ productId: 'p1', pathKey: 'node-a' });
  });

  it('buildReworkReportPaths without scope includes multiple products at same node', () => {
    const records = [
      rework({ id: 'r1', productId: 'p1', orderId: 'o1' }),
      rework({ id: 'r2', productId: 'p2', orderId: 'o2' }),
      rework({ id: 'r3', productId: 'p1', orderId: 'o3', variantId: 'v1', quantity: 5 }),
    ];
    const paths = buildReworkReportPaths({
      records,
      currentNodeId: nodeA,
      isOutsourceRework: false,
      processSequenceMode: 'free',
      globalNodes,
      anchorProductId: 'p1',
    });
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const productIds = new Set(paths.map(p => p.productId));
    expect(productIds.has('p1')).toBe(true);
    expect(productIds.has('p2')).toBe(true);
    expect(paths[0]!.productId).toBe('p1');
  });

  it('buildReworkReportPaths scopeProductId limits to entry product', () => {
    const records = [
      rework({ id: 'r1', productId: 'p1', orderId: 'o1' }),
      rework({ id: 'r2', productId: 'p2', orderId: 'o2' }),
    ];
    const paths = buildReworkReportPaths({
      records,
      currentNodeId: nodeA,
      isOutsourceRework: false,
      processSequenceMode: 'free',
      globalNodes,
      scopeProductId: 'p1',
    });
    expect(paths.every(p => p.productId === 'p1')).toBe(true);
    expect(paths.length).toBe(1);
  });

  it('buildReworkReportPaths scopeOrderId limits to entry order', () => {
    const records = [
      rework({ id: 'r1', productId: 'p1', orderId: 'o1' }),
      rework({ id: 'r2', productId: 'p1', orderId: 'o2' }),
    ];
    const paths = buildReworkReportPaths({
      records,
      currentNodeId: nodeA,
      isOutsourceRework: false,
      processSequenceMode: 'free',
      globalNodes,
      scopeProductId: 'p1',
      scopeOrderId: 'o1',
    });
    expect(paths.length).toBe(1);
    expect(paths[0]!.records.every(r => r.orderId === 'o1')).toBe(true);
  });

  it('groupReworkPathsByProduct aggregates paths', () => {
    const paths = buildReworkReportPaths({
      records: [
        rework({ id: 'r1', productId: 'p1' }),
        rework({ id: 'r2', productId: 'p2' }),
      ],
      currentNodeId: nodeA,
      isOutsourceRework: false,
      processSequenceMode: 'free',
      globalNodes,
    });
    const groups = groupReworkPathsByProduct(paths);
    expect(groups.length).toBe(2);
    expect(groups.reduce((s, g) => s + g.totalPending, 0)).toBe(
      paths.reduce((s, p) => s + p.totalPending, 0),
    );
  });

  it('findReworkPathForScan matches product and variant', () => {
    const paths = buildReworkReportPaths({
      records: [
        rework({ id: 'r1', productId: 'p1', variantId: 'v1' }),
        rework({ id: 'r2', productId: 'p2', variantId: 'v2' }),
      ],
      currentNodeId: nodeA,
      isOutsourceRework: false,
      processSequenceMode: 'free',
      globalNodes,
    });
    const hit = findReworkPathForScan(paths, 'p2', 'v2');
    expect(hit?.productId).toBe('p2');
  });

  it('sumReworkEnteredForPath sums matrix keys', () => {
    const path = {
      productId: 'p1',
      pathKey: nodeA,
      pathLabel: 'A',
      nodeIds: [nodeA],
      records: [],
      totalPending: 10,
      pendingByVariant: { v1: 5, v2: 5 },
    };
    const qty = {
      [reworkQtyKey('p1', nodeA, 'v1')]: 2,
      [reworkQtyKey('p1', nodeA, 'v2')]: 3,
    };
    expect(sumReworkEnteredForPath(qty, 'p1', path, ['v1', 'v2'], true)).toBe(5);
  });
});
