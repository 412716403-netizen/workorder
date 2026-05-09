import type { PrintDynamicListColumn, PrintDynamicListElementConfig, PrintListRow } from '../types';
import { parseColorMaterialMatrixFromRow } from './colorMaterialMatrixPrint';
import { parseColorSizeMatrixFromRow } from './colorSizeMatrixPrint';

export type PrintMatrixColumnKind = 'colorSizeMatrix' | 'colorMaterialMatrix';

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

export function getMatrixColumnKind(cfg: PrintDynamicListElementConfig): PrintMatrixColumnKind | null {
  const col = padDynamicListDataColumns(cfg).find(
    c => c.cellKind === 'colorSizeMatrix' || c.cellKind === 'colorMaterialMatrix',
  );
  if (!col?.cellKind || col.cellKind === 'text') return null;
  return col.cellKind;
}

export function dynamicListHasMatrixColumn(cfg: PrintDynamicListElementConfig): boolean {
  return getMatrixColumnKind(cfg) != null;
}

/** 无模版 cfg 时根据行数据推断矩阵种类（分页/推挤兜底） */
export function inferMatrixKindFromRow(row: PrintListRow, cfg?: PrintDynamicListElementConfig): PrintMatrixColumnKind | null {
  const fromTpl = cfg ? getMatrixColumnKind(cfg) : null;
  if (fromTpl) return fromTpl;
  const cm = parseColorMaterialMatrixFromRow(row);
  if (cm && cm.nodeBlocks.length > 0) return 'colorMaterialMatrix';
  const cs = parseColorSizeMatrixFromRow(row);
  if (cs && (cs.colorRows.length > 0 || cs.sizes.length > 0)) return 'colorSizeMatrix';
  return null;
}

/** 该行矩阵在表内应占的尺码/物料槽列数（≥1） */
export function matrixKForPrintRow(row: PrintListRow, cfg?: PrintDynamicListElementConfig): number {
  const kind = inferMatrixKindFromRow(row, cfg) ?? 'colorSizeMatrix';
  if (kind === 'colorMaterialMatrix') {
    const p = parseColorMaterialMatrixFromRow(row);
    if (!p || p.nodeBlocks.length === 0) return 1;
    let maxM = 1;
    for (const b of p.nodeBlocks) {
      for (const cr of b.colorRows) {
        maxM = Math.max(maxM, Math.max(1, cr.materials.length));
      }
    }
    return maxM;
  }
  const p = parseColorSizeMatrixFromRow(row);
  if (!p || p.colorRows.length === 0) return 1;
  return Math.max(1, ...p.colorRows.map(r => Math.max(1, r.quantities.length)), p.sizes.length);
}

/** 每个 PrintListRow 在矩阵模式下的 tbody 视觉子行数 */
export function matrixVisualSubRowCountForRow(row: PrintListRow, cfg?: PrintDynamicListElementConfig): number {
  const kind = inferMatrixKindFromRow(row, cfg) ?? 'colorSizeMatrix';
  if (kind === 'colorMaterialMatrix') {
    const p = parseColorMaterialMatrixFromRow(row);
    if (!p || p.nodeBlocks.length === 0) return 2;
    let s = 0;
    for (const b of p.nodeBlocks) {
      const nColors = b.colorRows.length > 0 ? b.colorRows.length : 1;
      s += 1 + 2 * nColors;
    }
    return Math.max(1, s);
  }
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
