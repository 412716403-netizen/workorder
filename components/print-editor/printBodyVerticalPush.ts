import type { PrintBodyElement, PrintDynamicListElementConfig, PrintRenderContext } from '../../types';
import {
  DYNAMIC_LIST_DEFAULT_BODY_ROW_MM,
  dynamicListHeaderHeightMm,
} from '../../utils/printListPagination';
import { dynamicListHasMatrixColumn, matrixVisualSubRowCountForRow } from '../../utils/dynamicListMatrix';

/**
 * 动态列表：按当前页数据估算内容所需高度，超过组件框高部分 (mm)。
 * 用于把模板中位于列表下方的正文/线条等整体下移，避免被列表遮挡。
 *
 * - 设了 `bodyRowHeightMm` 时按固定行高累计；
 * - 未设置时与分页算法一致，使用 `DYNAMIC_LIST_DEFAULT_BODY_ROW_MM` 估算（矩阵表按视觉子行数累计）。
 */
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
  const headerMm = dynamicListHeaderHeightMm(cfg);
  const rowH =
    cfg.bodyRowHeightMm != null && cfg.bodyRowHeightMm > 0
      ? Math.max(0.5, cfg.bodyRowHeightMm)
      : DYNAMIC_LIST_DEFAULT_BODY_ROW_MM;
  const hasMatrix = dynamicListHasMatrixColumn(cfg);
  const slotTotal =
    hasMatrix && rows.length > 0
      ? rows.reduce((s, r) => s + matrixVisualSubRowCountForRow(r), 0)
      : rowCount;
  const needMm = headerMm + slotTotal * rowH;
  return Math.max(0, needMm - el.height);
}

/**
 * 按画布元素自上而下（y）累积：动态列表内容高于框时，把下方元素的 top 整体下移。
 * 页眉/页脚在 PrintPaper 中单独渲染，不在此集合内，故不受影响。
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
