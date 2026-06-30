import { describe, expect, it } from 'vitest';
import {
  processNodePriceContextKey,
  resolveEffectiveNodePriceRule,
  resolveOutsourceUnitPriceFromRule,
  resolveReportUnitPriceFromRule,
  resolveTheoreticalProcessUnitPrice,
} from './processEconomicsPrice';

describe('processEconomicsPrice', () => {
  it('resolveEffectiveNodePriceRule prefers node override', () => {
    const { rule, ruleSource } = resolveEffectiveNodePriceRule(
      {
        defaultRule: { mode: 'last_purchase' },
        nodeOverrides: { n1: { mode: 'fixed_range', startDate: '2026-01-01', endDate: '2026-01-31' } },
      },
      'n1',
    );
    expect(ruleSource).toBe('node_override');
    expect(rule.mode).toBe('fixed_range');
  });

  it('resolveReportUnitPriceFromRule uses latest rate', () => {
    const res = resolveReportUnitPriceFromRule(
      [
        { rate: 5, quantity: 10, timestamp: '2026-01-01' },
        { rate: 8, quantity: 2, timestamp: '2026-02-01' },
      ],
      { mode: 'last_purchase' },
      3,
    );
    expect(res.unitPrice).toBe(8);
    expect(res.priceSource).toBe('last_record');
  });

  it('resolveOutsourceUnitPriceFromRule falls back to archive node rate', () => {
    const res = resolveOutsourceUnitPriceFromRule([], { mode: 'last_purchase' }, 12);
    expect(res.unitPrice).toBe(12);
    expect(res.priceSource).toBe('archive');
  });

  it('resolveTheoreticalProcessUnitPrice prefers outsource over report over nodeRates', () => {
    const productId = 'p1';
    const nodeId = 'n1';
    const outsourcePriceMap = new Map([[processNodePriceContextKey(productId, nodeId), 7]]);
    const reportPriceMap = new Map([[processNodePriceContextKey(productId, nodeId), 5]]);
    expect(
      resolveTheoreticalProcessUnitPrice({
        outsourcePriceMap,
        reportPriceMap,
        nodeRates: { n1: 3 },
        productId,
        nodeId,
      }),
    ).toBe(7);

    outsourcePriceMap.set(processNodePriceContextKey(productId, nodeId), 0);
    expect(
      resolveTheoreticalProcessUnitPrice({
        outsourcePriceMap,
        reportPriceMap,
        nodeRates: { n1: 3 },
        productId,
        nodeId,
      }),
    ).toBe(5);

    reportPriceMap.set(processNodePriceContextKey(productId, nodeId), 0);
    expect(
      resolveTheoreticalProcessUnitPrice({
        outsourcePriceMap,
        reportPriceMap,
        nodeRates: { n1: 3 },
        productId,
        nodeId,
      }),
    ).toBe(3);
  });
});
