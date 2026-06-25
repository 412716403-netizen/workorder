import { describe, it, expect } from 'vitest';
import { colorSizeRowSubtotal, fmtMatrixCellQtyLocal } from './colorSizeMatrixPrint';

describe('colorSizeRowSubtotal', () => {
  it('对颜色行各尺码数量求和', () => {
    expect(colorSizeRowSubtotal([10, 10, 10, 10])).toBe(40);
    expect(colorSizeRowSubtotal([3, 0, 5])).toBe(8);
  });

  it('空或非法输入返回 0', () => {
    expect(colorSizeRowSubtotal([])).toBe(0);
    expect(colorSizeRowSubtotal(undefined)).toBe(0);
  });

  it('忽略非数字项', () => {
    expect(colorSizeRowSubtotal([1, NaN as unknown as number, 2])).toBe(3);
  });
});

describe('fmtMatrixCellQtyLocal', () => {
  it('0 或非数字显示为空串', () => {
    expect(fmtMatrixCellQtyLocal(0)).toBe('');
    expect(fmtMatrixCellQtyLocal(NaN)).toBe('');
  });

  it('正常数字直接显示', () => {
    expect(fmtMatrixCellQtyLocal(40)).toBe('40');
  });
});
