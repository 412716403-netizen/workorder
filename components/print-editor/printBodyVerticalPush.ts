import type { PrintBodyElement, PrintDynamicListElementConfig, PrintRenderContext } from '../../types';
import {
  DYNAMIC_LIST_DEFAULT_BODY_ROW_MM,
  dynamicListHeaderHeightMm,
} from '../../utils/printListPagination';
import { dynamicListHasMatrixColumn, matrixVisualSubRowCountForRow } from '../../utils/dynamicListMatrix';

/**
 * 动态列表：按当前页数据估算内容所需高度 (mm)（表头 + 各数据行/矩阵视觉子行）。
 *
 * - 设了 `bodyRowHeightMm` 时按固定行高累计；
 * - 未设置时与分页算法一致，使用 `DYNAMIC_LIST_DEFAULT_BODY_ROW_MM` 估算（矩阵表按视觉子行数累计）。
 */
export function estimateDynamicListContentHeightMm(
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
      ? rows.reduce((s, r) => s + matrixVisualSubRowCountForRow(r, cfg), 0)
      : rowCount;
  return headerMm + slotTotal * rowH;
}

/**
 * 动态列表内容高度超过组件框高部分 (mm)。用于把列表框增高 (`heightGrowMm`) 以容纳内容。
 */
export function estimateDynamicListOverflowMm(
  el: PrintBodyElement,
  ctx: PrintRenderContext,
  listChunk: { rows: import('../../types').PrintListRow[]; serialStart: number } | undefined,
): number {
  if (el.type !== 'dynamicList') return 0;
  return Math.max(0, estimateDynamicListContentHeightMm(el, ctx, listChunk) - el.height);
}

/**
 * 按画布元素自上而下（y）累积：动态列表内容高于框时，把下方元素的 top 整体下移。
 * 页眉/页脚在 PrintPaper 中单独渲染，不在此集合内，故不受影响。
 *
 * 每个元素的下移量取两者较大：
 * - `push`：前序列表「溢出量」的累加（保持下方元素与列表的相对间距）；
 * - `contentBottom - el.y`：保证元素落在前序列表「实际内容底部」之下，
 *   即便元素原本被放在列表框内（如「合计」文本压在列表区域上），列表内容变长后也不会被盖住。
 */
export function computeBodyVerticalPushByElementId(
  elements: PrintBodyElement[],
  ctx: PrintRenderContext,
  listChunk: { rows: import('../../types').PrintListRow[]; serialStart: number } | undefined,
): Map<string, number> {
  const sorted = [...elements].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const map = new Map<string, number>();
  let push = 0;
  let contentBottom = Number.NEGATIVE_INFINITY;
  for (const el of sorted) {
    const elPush = Math.max(push, contentBottom - el.y, 0);
    map.set(el.id, elPush);
    if (el.type === 'dynamicList') {
      const contentH = estimateDynamicListContentHeightMm(el, ctx, listChunk);
      const overflow = Math.max(0, contentH - el.height);
      contentBottom = Math.max(contentBottom, el.y + elPush + contentH);
      push = elPush + overflow;
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
