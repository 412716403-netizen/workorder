import { describe, expect, it } from 'vitest';
import {
  computeReportMaterialCost,
  consumableQtyFromBreakdownRow,
  isWeightPurchaseUnit,
  materialCostFromBreakdownRows,
} from './productMaterialConsumableCost';

describe('productMaterialConsumableCost', () => {
  const unitNames = new Map([
    ['mat-kg', '千克'],
    ['mat-pcs', '件'],
  ]);
  const prices = new Map([
    ['mat-kg', 80],
    ['mat-pcs', 3],
  ]);

  it('isWeightPurchaseUnit recognizes kg aliases', () => {
    expect(isWeightPurchaseUnit('kg')).toBe(true);
    expect(isWeightPurchaseUnit('千克')).toBe(true);
    expect(isWeightPurchaseUnit('件')).toBe(false);
  });

  it('uses actualWeight only (matches panel applyMaterialBreakdown)', () => {
    expect(
      consumableQtyFromBreakdownRow(
        { materialProductId: 'mat-kg', actualWeight: 1.5, theoreticalQty: 10 },
        unitNames,
      ),
    ).toBe(1.5);
    expect(
      consumableQtyFromBreakdownRow(
        { materialProductId: 'mat-pcs', actualWeight: 0, theoreticalQty: 10 },
        unitNames,
      ),
    ).toBe(0);
    expect(
      consumableQtyFromBreakdownRow(
        { materialProductId: 'mat-pcs', actualWeight: 0.32, theoreticalQty: 10 },
        unitNames,
      ),
    ).toBe(0.32);
  });

  it('computeReportMaterialCost uses BOM when weight is off even if breakdown exists', () => {
    const cost = computeReportMaterialCost({
      weightEnabled: false,
      breakdown: [{ materialProductId: 'mat-kg', actualWeight: 99 }],
      goodQty: 2,
      bomItems: [{ productId: 'mat-pcs', quantity: 1 }],
      priceMap: prices,
      unitNameByMaterialId: unitNames,
    });
    expect(cost).toBe(6);
  });

  it('computeReportMaterialCost uses breakdown when weight is on', () => {
    const cost = computeReportMaterialCost({
      weightEnabled: true,
      breakdown: [
        { materialProductId: 'mat-kg', actualWeight: 1, theoreticalQty: 5 },
        { materialProductId: 'mat-pcs', actualWeight: 2, theoreticalQty: 99 },
      ],
      goodQty: 10,
      bomItems: [{ productId: 'mat-pcs', quantity: 99 }],
      priceMap: prices,
      unitNameByMaterialId: unitNames,
    });
    expect(materialCostFromBreakdownRows(
      [
        { materialProductId: 'mat-kg', actualWeight: 1, theoreticalQty: 5 },
        { materialProductId: 'mat-pcs', actualWeight: 2, theoreticalQty: 99 },
      ],
      prices,
      unitNames,
    )).toBe(80 + 6);
    expect(cost).toBe(86);
  });
});
