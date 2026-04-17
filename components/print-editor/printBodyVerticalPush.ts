import type { PrintBodyElement, PrintDynamicListElementConfig, PrintRenderContext, PrintSalesBillMatrixElementConfig } from '../../types';
import type { MatrixPageChunk } from '../../utils/printListPagination';
import { dynamicListHasMatrixColumn, matrixVisualSubRowCountForRow } from '../../utils/dynamicListMatrix';

/** 动态列表：固定行高时，内容所需高度可能超过组件框高，返回超出部分 (mm) */
export function estimateDynamicListOverflowMm(
  el: PrintBodyElement,
  ctx: PrintRenderContext,
  listChunk: { rows: import('../../types').PrintListRow[]; serialStart: number } | undefined,
): number {
  if (el.type !== 'dynamicList') return 0;
  const cfg = el.config as PrintDynamicListElementConfig;
  const rows =
    listChunk != null && ctx.printListRows?.length ? listChunk.rows : ctx.printListRows ?? [];
  const rowCount =
    listChunk != null && ctx.printListRows?.length
      ? listChunk.rows.length
      : Math.max(1, ctx.printListRows?.length ?? 1);
  let headerMm = 0;
  if (cfg.showHeader) {
    headerMm = cfg.headerRowHeightMm != null && cfg.headerRowHeightMm > 0 ? cfg.headerRowHeightMm : 4;
  }
  if (!(cfg.bodyRowHeightMm != null && cfg.bodyRowHeightMm > 0)) return 0;
  const hasMatrix = dynamicListHasMatrixColumn(cfg);
  const slotTotal =
    hasMatrix && rows.length > 0
      ? rows.reduce((s, r) => s + matrixVisualSubRowCountForRow(r), 0)
      : rowCount;
  const needMm = headerMm + slotTotal * cfg.bodyRowHeightMm;
  return Math.max(0, needMm - el.height);
}

/** 销售单矩阵：按 MatrixPageChunk 中的 entries 精确计算内容高度，超出组件框高部分 */
export function estimateSalesBillMatrixOverflowMm(
  el: PrintBodyElement,
  ctx: PrintRenderContext,
  matrixChunk: MatrixPageChunk | undefined,
): number {
  if (el.type !== 'salesBillMatrix') return 0;
  const cfg = el.config as PrintSalesBillMatrixElementConfig;
  const pt = cfg.fontSizePt ?? 7;
  const rowMm = Math.max(3.0, pt * 0.38 + 0.83);
  const separatorMm = 0.3;
  const tableBorderMm = 1;

  const entries = matrixChunk?.entries;
  if (!entries?.length) {
    const groups = ctx.salesBillMatrix ?? [];
    if (groups.length === 0) return 0;
    const theadMm = rowMm * 2.2;
    let bodyMm = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const N = Math.max(1, groups[gi].colorRows.length);
      if (gi > 0) bodyMm += separatorMm + rowMm; // sep + lead
      else bodyMm += 0; // first group: no separator, no lead
      bodyMm += N * rowMm;
    }
    return Math.max(0, theadMm + bodyMm + tableBorderMm - el.height);
  }

  const theadMm = matrixChunk.showThead ? rowMm * 2.2 : 0;
  let bodyMm = 0;
  for (const entry of entries) {
    const visRows = entry.colorRowEnd - entry.colorRowStart;
    if (entry.isGroupStart && entry.globalIndex > 0) {
      bodyMm += separatorMm + (1 + visRows) * rowMm; // sep + lead + colors
    } else {
      bodyMm += visRows * rowMm;
    }
  }
  const needMm = theadMm + bodyMm + tableBorderMm;
  return Math.max(0, needMm - el.height);
}

/**
 * 按画布元素自上而下（y）累积：动态列表 / 销售单矩阵若「内容高于框」，把下方元素的 top 整体下移。
 */
export function computeBodyVerticalPushByElementId(
  elements: PrintBodyElement[],
  ctx: PrintRenderContext,
  listChunk: { rows: import('../../types').PrintListRow[]; serialStart: number } | undefined,
  matrixChunk: MatrixPageChunk | undefined,
): Map<string, number> {
  const sorted = [...elements].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const map = new Map<string, number>();
  let push = 0;
  for (const el of sorted) {
    map.set(el.id, push);
    if (el.type === 'dynamicList') {
      push += estimateDynamicListOverflowMm(el, ctx, listChunk);
    } else if (el.type === 'salesBillMatrix') {
      push += estimateSalesBillMatrixOverflowMm(el, ctx, matrixChunk);
    }
  }
  return map;
}

export function elementHeightGrowMm(
  el: PrintBodyElement,
  ctx: PrintRenderContext,
  listChunk: { rows: import('../../types').PrintListRow[]; serialStart: number } | undefined,
  matrixChunk: MatrixPageChunk | undefined,
): number {
  if (el.type === 'dynamicList') return estimateDynamicListOverflowMm(el, ctx, listChunk);
  if (el.type === 'salesBillMatrix') return estimateSalesBillMatrixOverflowMm(el, ctx, matrixChunk);
  return 0;
}
