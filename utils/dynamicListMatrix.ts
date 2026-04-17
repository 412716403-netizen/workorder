import type { PrintDynamicListColumn, PrintDynamicListElementConfig, PrintListRow } from '../types';
import { parseColorSizeMatrixFromRow } from './colorSizeMatrixPrint';

/** 与画布动态列表 padding 规则一致 */
export function padDynamicListDataColumns(cfg: PrintDynamicListElementConfig): PrintDynamicListColumn[] {
  const rawCols = cfg.columns ?? [];
  const n = Math.max(1, cfg.dataColumnCount ?? (rawCols.length || 3));
  const dataCols = rawCols.slice(0, n);
  if (dataCols.length >= n) return dataCols;
  return [
    ...dataCols,
    ...Array.from({ length: n - dataCols.length }, (_, i) => ({
      id: `pad-${i}`,
      headerLabel: `列${dataCols.length + i + 1}`,
      contentTemplate: '',
      textAlign: 'left' as const,
      color: '#000000',
    })),
  ];
}

export function dynamicListHasMatrixColumn(cfg: PrintDynamicListElementConfig): boolean {
  return padDynamicListDataColumns(cfg).some(c => c.cellKind === 'colorSizeMatrix');
}

/** 该行矩阵在表内应占的尺码列数（≥1） */
export function matrixKForPrintRow(row: PrintListRow): number {
  const p = parseColorSizeMatrixFromRow(row);
  if (!p || p.colorRows.length === 0) return 1;
  return Math.max(1, ...p.colorRows.map(r => Math.max(1, r.quantities.length)), p.sizes.length);
}

/** 每个 PrintListRow 在矩阵模式下的 tbody 子行数：1 行尺码表头 + 至少 1 行颜色 */
export function matrixVisualSubRowCountForRow(row: PrintListRow): number {
  const p = parseColorSizeMatrixFromRow(row);
  const colorCount = p && p.colorRows.length > 0 ? p.colorRows.length : 1;
  return 1 + colorCount;
}

export function sizeHeadCellLabel(
  p: NonNullable<ReturnType<typeof parseColorSizeMatrixFromRow>>,
  i: number,
  rowK: number,
  maxK: number,
): string {
  const s = p.sizes[i];
  if (s != null && String(s).trim() !== '') return String(s);
  if (rowK === 1 && maxK === 1) return '均码';
  return '\u00a0';
}
