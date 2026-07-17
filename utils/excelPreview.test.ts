import { describe, it, expect } from 'vitest';
import {
  colLetterToIndex,
  parseCellRange,
  formatExcelCellValue,
  excelColWidthToPx,
  excelRowHeightToPx,
  emuToPx,
  computeAnchoredImageSize,
} from './excelPreview';

describe('colLetterToIndex', () => {
  it('maps single letters', () => {
    expect(colLetterToIndex('A')).toBe(0);
    expect(colLetterToIndex('Z')).toBe(25);
  });

  it('maps double letters', () => {
    expect(colLetterToIndex('AA')).toBe(26);
    expect(colLetterToIndex('AB')).toBe(27);
  });
});

describe('parseCellRange', () => {
  it('parses a merge range', () => {
    expect(parseCellRange('A1:B2')).toEqual({ top: 0, left: 0, bottom: 1, right: 1 });
  });

  it('parses multi-letter columns and lowercase', () => {
    expect(parseCellRange('c5:aa10')).toEqual({ top: 4, left: 2, bottom: 9, right: 26 });
  });

  it('rejects malformed input', () => {
    expect(parseCellRange('A1')).toBeNull();
    expect(parseCellRange('1A:2B')).toBeNull();
    expect(parseCellRange('')).toBeNull();
  });
});

describe('formatExcelCellValue', () => {
  it('handles primitives and nullish', () => {
    expect(formatExcelCellValue(null)).toBe('');
    expect(formatExcelCellValue(undefined)).toBe('');
    expect(formatExcelCellValue('abc')).toBe('abc');
    expect(formatExcelCellValue(42)).toBe('42');
    expect(formatExcelCellValue(true)).toBe('true');
  });

  it('joins rich text runs', () => {
    expect(formatExcelCellValue({ richText: [{ text: '凸轮轴' }, { text: '传感器' }] })).toBe('凸轮轴传感器');
  });

  it('uses hyperlink text', () => {
    expect(formatExcelCellValue({ text: '官网', hyperlink: 'https://x.cn' })).toBe('官网');
  });

  it('uses formula result', () => {
    expect(formatExcelCellValue({ formula: 'A1+A2', result: 3 })).toBe('3');
    expect(formatExcelCellValue({ sharedFormula: 'B1', result: 'ok' })).toBe('ok');
  });

  it('shows cell errors', () => {
    expect(formatExcelCellValue({ error: '#N/A' })).toBe('#N/A');
  });
});

describe('size conversions', () => {
  it('converts column width chars to px with default fallback', () => {
    expect(excelColWidthToPx(10)).toBe(75);
    expect(excelColWidthToPx(undefined)).toBe(excelColWidthToPx(8.43));
  });

  it('converts row height points to px with default fallback', () => {
    expect(excelRowHeightToPx(15)).toBe(20);
    expect(excelRowHeightToPx(undefined)).toBe(20);
  });

  it('converts EMU to px', () => {
    expect(emuToPx(9525)).toBe(1);
    expect(emuToPx(undefined)).toBe(0);
  });
});

describe('computeAnchoredImageSize', () => {
  it('sums whole columns/rows between anchors', () => {
    const size = computeAnchoredImageSize(
      { nativeCol: 1, nativeRow: 1 },
      { nativeCol: 3, nativeRow: 3 },
      [50, 60, 70, 80],
      [20, 25, 30, 35],
    );
    expect(size).toEqual({ width: 60 + 70, height: 25 + 30 });
  });

  it('applies EMU offsets and enforces a minimum', () => {
    const size = computeAnchoredImageSize(
      { nativeCol: 0, nativeRow: 0, nativeColOff: 9525, nativeRowOff: 0 },
      { nativeCol: 0, nativeRow: 0, nativeColOff: 9525 * 41, nativeRowOff: 9525 * 2 },
      [100],
      [30],
    );
    expect(size.width).toBe(40);
    expect(size.height).toBe(8); // 2px 被抬到最小值 8
  });
});
