/** Excel 预览（ExcelJS 解析）纯函数：单元格取值格式化、合并区解析、尺寸换算 */

export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** 列字母 → 0 基索引：A→0, Z→25, AA→26 */
export function colLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** 解析 "A1:B2" 合并区 → 0 基行列范围；非法输入返回 null */
export function parseCellRange(range: string): CellRange | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range.trim().toUpperCase());
  if (!m) return null;
  const left = colLetterToIndex(m[1]);
  const top = Number(m[2]) - 1;
  const right = colLetterToIndex(m[3]);
  const bottom = Number(m[4]) - 1;
  if (top < 0 || left < 0 || bottom < top || right < left) return null;
  return { top, left, bottom, right };
}

/** ExcelJS CellValue 的结构化联合（避免引入 exceljs 类型依赖） */
type CellValueLike =
  | null
  | undefined
  | string
  | number
  | boolean
  | Date
  | { richText: Array<{ text: string }> }
  | { text: unknown; hyperlink: string }
  | { formula?: string; sharedFormula?: string; result?: unknown }
  | { error: string };

/** 单元格取值 → 展示文本（富文本拼接、公式取结果、日期本地化） */
export function formatExcelCellValue(value: unknown): string {
  const v = value as CellValueLike;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toLocaleDateString('zh-CN');
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map(rt => rt?.text ?? '').join('');
    }
    if ('hyperlink' in v) {
      return formatExcelCellValue(v.text);
    }
    if ('error' in v && typeof v.error === 'string') return v.error;
    if ('formula' in v || 'sharedFormula' in v) {
      return formatExcelCellValue((v as { result?: unknown }).result);
    }
  }
  return '';
}

/** Excel 默认列宽（字符）与默认行高（磅） */
export const EXCEL_DEFAULT_COL_WIDTH_CHARS = 8.43;
export const EXCEL_DEFAULT_ROW_HEIGHT_POINTS = 15;

/** 列宽（字符数，Calibri 11 估算）→ px */
export function excelColWidthToPx(widthChars: number | undefined): number {
  const w = widthChars && widthChars > 0 ? widthChars : EXCEL_DEFAULT_COL_WIDTH_CHARS;
  return Math.round(w * 7 + 5);
}

/** 行高（磅）→ px（96dpi：1pt = 4/3 px） */
export function excelRowHeightToPx(heightPoints: number | undefined): number {
  const h = heightPoints && heightPoints > 0 ? heightPoints : EXCEL_DEFAULT_ROW_HEIGHT_POINTS;
  return Math.round((h * 4) / 3);
}

/** EMU → px（914400 EMU/in ÷ 96 px/in = 9525） */
export function emuToPx(emu: number | undefined): number {
  if (!emu || !Number.isFinite(emu)) return 0;
  return emu / 9525;
}

/**
 * 由图片锚点（tl/br 的列行 + EMU 偏移）与列宽/行高表估算图片渲染尺寸（px）。
 * 列/行超出已知宽高表时按默认宽高累加。
 */
export function computeAnchoredImageSize(
  tl: { nativeCol: number; nativeRow: number; nativeColOff?: number; nativeRowOff?: number },
  br: { nativeCol: number; nativeRow: number; nativeColOff?: number; nativeRowOff?: number },
  colWidthsPx: number[],
  rowHeightsPx: number[],
): { width: number; height: number } {
  const colX = (col: number, offEmu?: number): number => {
    let x = 0;
    for (let c = 0; c < col; c++) {
      x += colWidthsPx[c] ?? excelColWidthToPx(undefined);
    }
    return x + emuToPx(offEmu);
  };
  const rowY = (row: number, offEmu?: number): number => {
    let y = 0;
    for (let r = 0; r < row; r++) {
      y += rowHeightsPx[r] ?? excelRowHeightToPx(undefined);
    }
    return y + emuToPx(offEmu);
  };
  const width = colX(br.nativeCol, br.nativeColOff) - colX(tl.nativeCol, tl.nativeColOff);
  const height = rowY(br.nativeRow, br.nativeRowOff) - rowY(tl.nativeRow, tl.nativeRowOff);
  return {
    width: Math.max(8, Math.round(width)),
    height: Math.max(8, Math.round(height)),
  };
}
