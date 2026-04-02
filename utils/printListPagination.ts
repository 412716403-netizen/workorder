import type {
  PrintBodyElement,
  PrintDynamicListElementConfig,
  PrintListRow,
  PrintRenderContext,
  PrintTemplate,
} from '../types';

function dynamicListHeaderHeightMm(cfg: PrintDynamicListElementConfig): number {
  if (!cfg.showHeader) return 0;
  const h = cfg.headerRowHeightMm;
  if (h != null && h > 0) return h;
  return 4;
}

/** 组件内数据区可容纳的数据行数（至少 1） */
export function getDynamicListRowsPerPage(el: PrintBodyElement): number {
  if (el.type !== 'dynamicList') return 1;
  const cfg = el.config as PrintDynamicListElementConfig;
  const headerH = dynamicListHeaderHeightMm(cfg);
  const avail = Math.max(0.1, el.height - headerH);
  const rowH =
    cfg.bodyRowHeightMm != null && cfg.bodyRowHeightMm > 0 ? Math.max(0.5, cfg.bodyRowHeightMm) : 6;
  return Math.max(1, Math.floor(avail / rowH));
}

export type ListPaginationSummary = {
  /** 各动态列表取最小值，保证多列表同页切片一致 */
  globalRowsPerPage: number;
  /** 仅由明细行数决定的页数（≥1） */
  listDrivenPages: number;
  rowCount: number;
};

/** 无明细或未启用分页时返回 null */
export function computeListPaginationSummary(
  template: PrintTemplate,
  ctx: PrintRenderContext,
  editorMode: boolean,
): ListPaginationSummary | null {
  if (editorMode) return null;
  const rows = ctx.printListRows;
  if (!rows?.length) return null;
  const lists = template.elements.filter(e => e.type === 'dynamicList');
  if (!lists.length) return null;
  const rps = lists.map(e => getDynamicListRowsPerPage(e));
  const globalRowsPerPage = Math.min(...rps);
  const listDrivenPages = Math.max(1, Math.ceil(rows.length / globalRowsPerPage));
  return { globalRowsPerPage, listDrivenPages, rowCount: rows.length };
}

/** 与 ctx.page.total（若传入）取 max，用于物理页数 */
export function getListDrivenPageCount(template: PrintTemplate, ctx: PrintRenderContext, editorMode: boolean): number {
  const s = computeListPaginationSummary(template, ctx, editorMode);
  return s ? s.listDrivenPages : 1;
}

export function getListRowsForPrintPage(
  summary: ListPaginationSummary,
  printListRows: PrintListRow[],
  pageIndex1: number,
): { rows: PrintListRow[]; serialStart: number } {
  const start = (pageIndex1 - 1) * summary.globalRowsPerPage;
  const slice = printListRows.slice(start, start + summary.globalRowsPerPage);
  return { rows: slice, serialStart: start + 1 };
}

/** 工单明细 → 动态列表行（列模板可用 {{行.quantity}} 等） */
export function buildPrintListRowsFromOrderItems(order: { items: { variantId?: string; quantity: number; completedQuantity: number }[] }): PrintListRow[] {
  return order.items.map((item, idx) => ({
    index: idx + 1,
    variantId: item.variantId ?? '',
    quantity: item.quantity,
    completedQuantity: item.completedQuantity,
  }));
}
