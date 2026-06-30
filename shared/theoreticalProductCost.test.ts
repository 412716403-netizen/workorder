import { describe, expect, it } from 'vitest';
import { materialPriceContextKey } from './materialPurchasePrice';
import { processNodePriceContextKey } from './processEconomicsPrice';
import { buildTheoreticalCostBreakdown } from './theoreticalProductCost';

describe('theoreticalProductCost', () => {
  const priceMap = new Map([
    [materialPriceContextKey('parent', 'mat-a'), 10],
    [materialPriceContextKey('parent', 'mat-b'), 5],
  ]);
  const emptyProcessMap = new Map<string, number>();

  it('buildTheoreticalCostBreakdown sums BOM lines and process rates', () => {
    const breakdown = buildTheoreticalCostBreakdown({
      boms: [{
        parentProductId: 'parent',
        variantId: null,
        nodeId: null,
        items: [
          { productId: 'mat-a', quantity: 2 },
          { productId: 'mat-b', quantity: 1 },
        ],
      }],
      productId: 'parent',
      priceMap,
      nodeRates: { 'node-1': 3, 'node-2': 0, 'node-3': 7 },
      reportPriceMap: emptyProcessMap,
      outsourcePriceMap: new Map([[processNodePriceContextKey('parent', 'node-3'), 7]]),
      milestoneNodeIds: ['node-1', 'node-2', 'node-3'],
      materialLabelById: new Map([['mat-a', '物料A'], ['mat-b', '物料B']]),
      nodeNameById: new Map([['node-1', '工序1'], ['node-3', '工序3']]),
    });

    expect(breakdown.total).toBe(35);
    expect(breakdown.items).toHaveLength(4);
    expect(breakdown.items.filter(i => i.kind === 'material')).toHaveLength(2);
    expect(breakdown.items.filter(i => i.kind === 'process')).toHaveLength(2);
    expect(breakdown.items.reduce((s, i) => s + i.amount, 0)).toBe(breakdown.total);
  });
});
