import { describe, it, expect } from 'vitest';
import {
  weightToNumberSumPart,
  parseWeightFieldForEdit,
  distributeReportWeightsByGoodQty,
  distributeWeightByQty,
  formatWeightKgDisplay,
  roundWeightKg,
} from './reportBatchWeightHelpers';

describe('weightToNumberSumPart', () => {
  it('number / 数字字符串正常通过', () => {
    expect(weightToNumberSumPart(1.5)).toBe(1.5);
    expect(weightToNumberSumPart('2.25')).toBe(2.25);
  });
  it('0 / 负数 / 无效 → 0', () => {
    expect(weightToNumberSumPart(0)).toBe(0);
    expect(weightToNumberSumPart(-1)).toBe(0);
    expect(weightToNumberSumPart('abc')).toBe(0);
    expect(weightToNumberSumPart(null)).toBe(0);
    expect(weightToNumberSumPart(undefined)).toBe(0);
    expect(weightToNumberSumPart(NaN)).toBe(0);
  });
});

describe('parseWeightFieldForEdit', () => {
  it('合法非负 number → number', () => {
    expect(parseWeightFieldForEdit(0)).toBe(0);
    expect(parseWeightFieldForEdit(1.5)).toBe(1.5);
    expect(parseWeightFieldForEdit('2.25')).toBe(2.25);
  });
  it('负数 / 无效 → 空字符串', () => {
    expect(parseWeightFieldForEdit(-1)).toBe('');
    expect(parseWeightFieldForEdit('xyz')).toBe('');
    expect(parseWeightFieldForEdit(null)).toBe('');
    expect(parseWeightFieldForEdit(undefined)).toBe('');
  });
});

describe('distributeReportWeightsByGoodQty', () => {
  it('空行 → []', () => {
    expect(distributeReportWeightsByGoodQty(10, [])).toEqual([]);
  });
  it('良品总数 0 → 全 0', () => {
    expect(distributeReportWeightsByGoodQty(10, [{ quantity: 0 }, { quantity: 0 }])).toEqual([0, 0]);
  });
  it('比例分摊：均分场景', () => {
    const r = distributeReportWeightsByGoodQty(10, [{ quantity: 5 }, { quantity: 5 }]);
    expect(r).toEqual([5, 5]);
    expect(r.reduce((s, n) => s + n, 0)).toBeCloseTo(10);
  });
  it('比例分摊：不等量比例', () => {
    const r = distributeReportWeightsByGoodQty(10, [{ quantity: 1 }, { quantity: 3 }]);
    expect(r[0]).toBeCloseTo(2.5);
    expect(r[1]).toBeCloseTo(7.5);
    expect(r.reduce((s, n) => s + n, 0)).toBeCloseTo(10);
  });
  it('最后一行吸收舍入误差，保证 Σ === batchW', () => {
    const r = distributeReportWeightsByGoodQty(10, [{ quantity: 1 }, { quantity: 1 }, { quantity: 1 }]);
    expect(r.reduce((s, n) => s + n, 0)).toBeCloseTo(10);
    expect(r.length).toBe(3);
  });
  it('单行直接吃全部', () => {
    expect(distributeReportWeightsByGoodQty(7.5, [{ quantity: 3 }])).toEqual([7.5]);
  });
  it('11kg 三等分：末行吸收误差，Σ 精确等于 11', () => {
    const r = distributeWeightByQty(11, [{ quantity: 1 }, { quantity: 1 }, { quantity: 1 }]);
    expect(r.reduce((s, n) => s + n, 0)).toBe(11);
    expect(r.every(n => Number.isFinite(n))).toBe(true);
  });
});

describe('formatWeightKgDisplay', () => {
  it('整数展示不带小数', () => {
    expect(formatWeightKgDisplay(11)).toBe('11');
    expect(formatWeightKgDisplay(3.6667)).toBe('3.6667');
  });
  it('小数去尾零', () => {
    expect(formatWeightKgDisplay(1.5)).toBe('1.5');
    expect(formatWeightKgDisplay('2.2500')).toBe('2.25');
  });
  it('无效 / 非正 → —', () => {
    expect(formatWeightKgDisplay(0)).toBe('—');
    expect(formatWeightKgDisplay(-1)).toBe('—');
    expect(formatWeightKgDisplay('abc')).toBe('—');
  });
});

describe('roundWeightKg', () => {
  it('四舍五入到 4 位小数', () => {
    expect(roundWeightKg(10.99985)).toBe(10.9999);
    expect(roundWeightKg(10.99984)).toBe(10.9998);
  });
});
