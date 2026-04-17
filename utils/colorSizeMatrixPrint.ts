import type { PrintListRow, SalesBillMatrixGroup } from '../types';

/** 动态列表行内嵌颜色尺码矩阵 JSON 使用的键（与 buildSalesBillPrintListRowsByProductLine 一致） */
export const COLOR_SIZE_MATRIX_JSON_KEY = 'colorSizeMatrixJson' as const;

export type ColorSizeMatrixPayload = {
  sizes: string[];
  colorRows: { colorName: string; quantities: number[] }[];
};

export function serializeColorSizeMatrixPayload(p: ColorSizeMatrixPayload): string {
  return JSON.stringify(p);
}

export function parseColorSizeMatrixFromRow(row: PrintListRow): ColorSizeMatrixPayload | null {
  const raw = row[COLOR_SIZE_MATRIX_JSON_KEY];
  if (raw == null || typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const sizes = (o as { sizes?: unknown }).sizes;
    const colorRows = (o as { colorRows?: unknown }).colorRows;
    if (!Array.isArray(sizes) || !Array.isArray(colorRows)) return null;
    const normSizes = sizes.map(s => (s == null ? '' : String(s)));
    const normRows = colorRows.map((r: unknown) => {
      if (!r || typeof r !== 'object') return { colorName: '', quantities: [] as number[] };
      const cr = r as { colorName?: unknown; quantities?: unknown };
      const q = Array.isArray(cr.quantities) ? cr.quantities.map(n => Number(n) || 0) : [];
      return { colorName: cr.colorName == null ? '' : String(cr.colorName), quantities: q };
    });
    return { sizes: normSizes, colorRows: normRows };
  } catch {
    return null;
  }
}

export function matrixGroupToColorSizePayload(g: SalesBillMatrixGroup): ColorSizeMatrixPayload {
  return {
    sizes: g.sizes.map(s => String(s ?? '')),
    colorRows: g.colorRows.map(cr => ({
      colorName: cr.colorName,
      quantities: [...cr.quantities],
    })),
  };
}

export function fmtMatrixCellQtyLocal(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '';
  return String(n);
}
