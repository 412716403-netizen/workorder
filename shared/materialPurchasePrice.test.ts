import { describe, expect, it } from 'vitest';
import {
  buildPeriodExpandLadder,
  filterBillsInRange,
  formatMaterialPriceRuleLabel,
  resolveEffectiveMaterialPriceRule,
  resolveMaterialUnitPriceFromRule,
  weightedAvgFromBills,
} from './materialPurchasePrice';

describe('materialPurchasePrice', () => {
  const bills = [
    { quantity: 10, purchasePrice: 100, timestamp: '2026-01-01T10:00:00.000Z' },
    { quantity: 5, purchasePrice: 130, timestamp: '2026-06-01T10:00:00.000Z' },
  ];

  const globalRule = { mode: 'all_time' as const };
  const parentDefault = { mode: 'last_purchase' as const };
  const materialOverride = {
    mode: 'fixed_range' as const,
    startDate: '2026-01-01',
    endDate: '2026-03-31',
  };

  it('weightedAvgFromBills computes quantity-weighted average', () => {
    expect(weightedAvgFromBills(bills)).toBe((10 * 100 + 5 * 130) / 15);
  });

  it('resolveEffectiveMaterialPriceRule prefers material override', () => {
    const r = resolveEffectiveMaterialPriceRule(globalRule, {
      defaultRule: parentDefault,
      materialOverrides: { 'mat-1': materialOverride },
    }, 'mat-1');
    expect(r.ruleSource).toBe('material_override');
    expect(r.rule).toEqual(materialOverride);
  });

  it('resolveEffectiveMaterialPriceRule falls back to parent default', () => {
    const r = resolveEffectiveMaterialPriceRule(globalRule, {
      defaultRule: parentDefault,
      materialOverrides: { 'mat-1': { inherit: true } },
    }, 'mat-1');
    expect(r.ruleSource).toBe('parent_default');
    expect(r.rule).toEqual(parentDefault);
  });

  it('resolveEffectiveMaterialPriceRule falls back to parent default last_purchase', () => {
    const r = resolveEffectiveMaterialPriceRule(globalRule, null, 'mat-1');
    expect(r.ruleSource).toBe('parent_default');
    expect(r.rule).toEqual({ mode: 'last_purchase' });
  });

  it('buildPeriodExpandLadder expands fixed_range and ends with all_time', () => {
    const ladder = buildPeriodExpandLadder({
      mode: 'fixed_range',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    });
    expect(ladder[0]?.mode).toBe('fixed_range');
    expect(ladder[ladder.length - 1]).toEqual({ mode: 'all_time' });
  });

  it('resolveMaterialUnitPriceFromRule uses all_time by default', () => {
    const r = resolveMaterialUnitPriceFromRule(bills, { mode: 'all_time' }, 50);
    expect(r.priceSource).toBe('all_time');
    expect(r.unitPrice).toBeCloseTo(110, 5);
  });

  it('resolveMaterialUnitPriceFromRule falls back to archive when no bills', () => {
    const r = resolveMaterialUnitPriceFromRule([], { mode: 'all_time' }, 88);
    expect(r.priceSource).toBe('archive');
    expect(r.unitPrice).toBe(88);
  });

  it('filterBillsInRange respects timestamp window', () => {
    const range = {
      start: new Date('2026-05-01T00:00:00'),
      end: new Date('2026-06-30T23:59:59.999'),
    };
    const filtered = filterBillsInRange(bills, range);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.purchasePrice).toBe(130);
  });

  it('resolveMaterialUnitPriceFromRule uses last_purchase mode', () => {
    const r = resolveMaterialUnitPriceFromRule(bills, { mode: 'last_purchase' }, 50);
    expect(r.priceSource).toBe('last_purchase');
    expect(r.unitPrice).toBe(130);
  });

  it('formatMaterialPriceRuleLabel', () => {
    expect(formatMaterialPriceRuleLabel({ mode: 'all_time' })).toContain('全部采购入库');
    expect(formatMaterialPriceRuleLabel({ mode: 'last_purchase' })).toBe('最近一次采购价');
    expect(
      formatMaterialPriceRuleLabel({
        mode: 'fixed_range',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
      }),
    ).toBe('2026-01-01 ~ 2026-06-30');
  });
});
