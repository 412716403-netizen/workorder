import { describe, it, expect } from 'vitest';
import { calcUsageByWeight, calcUsageByWeightMultiVariant } from './bomMaterialUsageByWeight';
import type { Product } from '../types';

const productsById = new Map<string, Pick<Product, 'id' | 'name'>>([
  ['mat-yellow', { id: 'mat-yellow', name: '黄色全毛' }],
  ['mat-red', { id: 'mat-red', name: '太阳红' }],
  ['mat-purple', { id: 'mat-purple', name: '全毛紫色' }],
]);

const bomOf = (materialId: string, quantity = 0.25) => ({
  items: [{ productId: materialId, quantity } as never],
});

describe('calcUsageByWeight', () => {
  it('单 BOM 按占比拆分', () => {
    const rows = calcUsageByWeight(bomOf('mat-yellow'), 10, 2.5, productsById);
    expect(rows).toHaveLength(1);
    expect(rows[0].materialProductId).toBe('mat-yellow');
    expect(rows[0].ratio).toBe(1);
    expect(rows[0].actualWeight).toBe(2.5);
    expect(rows[0].theoreticalQty).toBeCloseTo(2.5);
  });
});

describe('calcUsageByWeightMultiVariant', () => {
  it('各规格 BOM 物料不同时合并出多行（不再只显示第一个规格）', () => {
    const rows = calcUsageByWeightMultiVariant(
      [
        { bom: bomOf('mat-yellow'), quantity: 10 },
        { bom: bomOf('mat-red'), quantity: 20 },
        { bom: bomOf('mat-purple'), quantity: 10 },
      ],
      4,
      productsById,
    );
    expect(rows.map(r => r.materialProductId).sort()).toEqual(['mat-purple', 'mat-red', 'mat-yellow']);
    const byId = new Map(rows.map(r => [r.materialProductId, r]));
    // 总重按 10:20:10 分摊 → 1 / 2 / 1 kg
    expect(byId.get('mat-yellow')!.actualWeight).toBeCloseTo(1);
    expect(byId.get('mat-red')!.actualWeight).toBeCloseTo(2);
    expect(byId.get('mat-purple')!.actualWeight).toBeCloseTo(1);
    // 占比按合并后的实际重量归一化
    expect(byId.get('mat-red')!.ratio).toBeCloseTo(0.5);
    // 理论件数 = 各规格件数 × BOM 单耗
    expect(byId.get('mat-red')!.theoreticalQty).toBeCloseTo(5);
  });

  it('同一物料被多个规格共用时合并累加', () => {
    const rows = calcUsageByWeightMultiVariant(
      [
        { bom: bomOf('mat-yellow'), quantity: 10 },
        { bom: bomOf('mat-yellow'), quantity: 30 },
      ],
      8,
      productsById,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actualWeight).toBeCloseTo(8);
    expect(rows[0].ratio).toBe(1);
    expect(rows[0].theoreticalQty).toBeCloseTo(10);
  });

  it('某规格缺 BOM 时该份重量不计入拆分（与后端仅保存重量一致）', () => {
    const rows = calcUsageByWeightMultiVariant(
      [
        { bom: bomOf('mat-yellow'), quantity: 10 },
        { bom: null, quantity: 10 },
      ],
      4,
      productsById,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].materialProductId).toBe('mat-yellow');
    expect(rows[0].actualWeight).toBeCloseTo(2);
  });

  it('总重为 0 或无有效数量时返回空', () => {
    expect(calcUsageByWeightMultiVariant([{ bom: bomOf('mat-yellow'), quantity: 10 }], 0, productsById)).toEqual([]);
    expect(calcUsageByWeightMultiVariant([{ bom: bomOf('mat-yellow'), quantity: 0 }], 5, productsById)).toEqual([]);
  });
});
