import type { PrintBodyElement, PrintDynamicListElementConfig, PrintRenderContext } from '../../types';
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

/**
 * 按画布元素自上而下（y）累积：动态列表若「内容高于框」，把下方元素的 top 整体下移。
 */
export function computeBodyVerticalPushByElementId(
  elements: PrintBodyElement[],
  ctx: PrintRenderContext,
  listChunk: { rows: import('../../types').PrintListRow[]; serialStart: number } | undefined,
): Map<string, number> {
  const sorted = [...elements].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const map = new Map<string, number>();
  let push = 0;
  for (const el of sorted) {
    map.set(el.id, push);
    if (el.type === 'dynamicList') {
      push += estimateDynamicListOverflowMm(el, ctx, listChunk);
    }
  }
  return map;
}

export function elementHeightGrowMm(
  el: PrintBodyElement,
  ctx: PrintRenderContext,
  listChunk: { rows: import('../../types').PrintListRow[]; serialStart: number } | undefined,
): number {
  if (el.type === 'dynamicList') return estimateDynamicListOverflowMm(el, ctx, listChunk);
  return 0;
}
