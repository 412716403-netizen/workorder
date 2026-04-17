import type {
  PrintBodyElement,
  PrintDynamicListElementConfig,
  PrintListRow,
  PrintRenderContext,
  PrintSalesBillMatrixElementConfig,
  PrintTemplate,
  SalesBillMatrixGroup,
} from '../types';
import { dynamicListHasMatrixColumn, matrixVisualSubRowCountForRow } from './dynamicListMatrix';

function dynamicListHeaderHeightMm(cfg: PrintDynamicListElementConfig): number {
  if (!cfg.showHeader) return 0;
  const h = cfg.headerRowHeightMm;
  return h != null && h > 0 ? h : 4;
}

/** 组件内数据区可容纳的数据行数（至少 1）。
 *  bodyH 非空时以「画布高度 - 组件 y」作为可用高度，使列表尽量填满整页。 */
export function getDynamicListRowsPerPage(
  el: PrintBodyElement,
  bodyH?: number,
  printListRows?: PrintListRow[],
): number {
  if (el.type !== 'dynamicList') return 1;
  const cfg = el.config as PrintDynamicListElementConfig;
  const headerH = dynamicListHeaderHeightMm(cfg);
  const effectiveH = bodyH != null ? Math.max(el.height, bodyH - el.y) : el.height;
  const avail = Math.max(0.1, effectiveH - headerH);
  const rowH =
    cfg.bodyRowHeightMm != null && cfg.bodyRowHeightMm > 0 ? Math.max(0.5, cfg.bodyRowHeightMm) : 6;
  const hasMatrix = dynamicListHasMatrixColumn(cfg);
  if (!hasMatrix || !printListRows?.length) {
    return Math.max(1, Math.floor(avail / rowH));
  }
  const maxSlots = Math.max(1, ...printListRows.map(matrixVisualSubRowCountForRow));
  return Math.max(1, Math.floor(avail / (rowH * maxSlots)));
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
  bodyH?: number,
): ListPaginationSummary | null {
  if (editorMode) return null;
  const rows = ctx.printListRows;
  if (!rows?.length) return null;
  const lists = template.elements.filter(e => e.type === 'dynamicList');
  if (!lists.length) return null;
  const rps = lists.map(e => getDynamicListRowsPerPage(e, bodyH, rows));
  const globalRowsPerPage = Math.min(...rps);
  const listDrivenPages = Math.max(1, Math.ceil(rows.length / globalRowsPerPage));
  return { globalRowsPerPage, listDrivenPages, rowCount: rows.length };
}

/** 与 ctx.page.total（若传入）取 max，用于物理页数 */
export function getListDrivenPageCount(template: PrintTemplate, ctx: PrintRenderContext, editorMode: boolean, bodyH?: number): number {
  const s = computeListPaginationSummary(template, ctx, editorMode, bodyH);
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

/* ─── 销售单矩阵分页 ─── */

/** 单个 entry = 一页中某个产品组的可见部分 */
export type MatrixPageEntry = {
  group: SalesBillMatrixGroup;
  globalIndex: number;
  colorRowStart: number;
  colorRowEnd: number;
  isGroupStart: boolean;
};

/** 一页的矩阵切片 */
export type MatrixPageChunk = {
  entries: MatrixPageEntry[];
  showThead: boolean;
  /** true = 该页跳过页眉页脚，矩阵从 y=0 开始 */
  startFromTop: boolean;
};

export type MatrixPaginationSummary = {
  pageChunks: MatrixPageChunk[];
  matrixDrivenPages: number;
  groupCount: number;
};

/** 行高估算 — 与 CSS 同步: padding 0.2mm, lineHeight 1.08
 *  pt×0.352×1.08 + 0.4(padding) + 0.25(border) ≈ 3.12mm @6.5pt
 *  +6% 安全余量 → 3.3mm；separatorMm ≈ 0.3mm */
function matrixRowMetrics(el: PrintBodyElement) {
  const cfg = el.config as PrintSalesBillMatrixElementConfig;
  const pt = cfg?.fontSizePt ?? 7;
  const rowMm = Math.max(3.0, pt * 0.38 + 0.83);
  const theadMm = rowMm * 2.2;
  const separatorMm = 0.3;
  return { rowMm, theadMm, separatorMm };
}

/**
 * 贪心分页：根据是否有 repeatPerPage 元素选择策略
 *  - 场景 1（无 repeat）：行级分页，同一产品可跨页；第 2 页起无 thead、从 y=0 开始
 *  - 场景 2（有 repeat）：组级分页，同一产品不跨页；每页都有 thead
 */
function computeMatrixPageChunks(
  el: PrintBodyElement,
  groups: SalesBillMatrixGroup[],
  bodyH: number,
  innerH: number,
  hasRepeatElements: boolean,
  belowElementsReservedMm: number,
): MatrixPageChunk[] {
  const { rowMm, theadMm, separatorMm } = matrixRowMetrics(el);
  const tableBorderMm = 1;

  const chunks: MatrixPageChunk[] = [];
  let gi = 0;
  let cri = 0;
  let isFirstPage = true;

  while (gi < groups.length) {
    const showThead = isFirstPage || hasRepeatElements;
    const startFromTop = !isFirstPage && !hasRepeatElements;
    const pageAvail = (() => {
      let h: number;
      if (startFromTop) h = innerH;
      else h = bodyH - el.y;
      if (showThead) h -= theadMm;
      h -= tableBorderMm;
      if (hasRepeatElements) h -= belowElementsReservedMm;
      return Math.max(rowMm, h);
    })();

    let usedMm = 0;
    const entries: MatrixPageEntry[] = [];

    while (gi < groups.length) {
      const g = groups[gi];
      const totalN = Math.max(1, g.colorRows.length);
      const remaining = totalN - cri;
      const isGroupStart = cri === 0;

      // separator = height:1px + borders ≈ 0.6mm; lead = 1 full row
      const prefixMm = (isGroupStart && gi > 0) ? (separatorMm + rowMm) : 0;

      if (hasRepeatElements) {
        /* ── 场景 2：整组不拆分 ── */
        const groupMm = prefixMm + remaining * rowMm;
        if (usedMm + groupMm > pageAvail && entries.length > 0) break;
        entries.push({ group: g, globalIndex: gi, colorRowStart: 0, colorRowEnd: totalN, isGroupStart: true });
        usedMm += groupMm;
        gi++;
        cri = 0;
      } else {
        /* ── 场景 1：行级拆分 ── */
        const availForRows = Math.max(0, pageAvail - usedMm - prefixMm);
        let canFit = Math.floor(availForRows / rowMm);
        if (canFit <= 0 && entries.length > 0) break;
        canFit = Math.max(1, canFit);
        const take = Math.min(remaining, canFit);
        entries.push({ group: g, globalIndex: gi, colorRowStart: cri, colorRowEnd: cri + take, isGroupStart });
        usedMm += prefixMm + take * rowMm;
        cri += take;
        if (cri >= totalN) { gi++; cri = 0; }
      }
    }

    if (entries.length > 0) {
      chunks.push({ entries, showThead, startFromTop });
    }
    isFirstPage = false;
  }
  return chunks;
}

export function computeMatrixPaginationSummary(
  template: PrintTemplate,
  ctx: PrintRenderContext,
  editorMode: boolean,
  bodyH?: number,
  innerH?: number,
): MatrixPaginationSummary | null {
  if (editorMode) return null;
  const groups = ctx.salesBillMatrix;
  if (!groups?.length) return null;
  const mats = template.elements.filter(e => e.type === 'salesBillMatrix');
  if (!mats.length) return null;
  const el = mats[0];
  const bH = bodyH ?? (el.height + el.y);
  const iH = innerH ?? bH;
  const hasRepeat = template.elements.some(
    e => e.repeatPerPage && e.type !== 'salesBillMatrix' && e.type !== 'dynamicList',
  );
  let belowReserved = 0;
  if (hasRepeat) {
    const matrixBottom = el.y + el.height;
    for (const e of template.elements) {
      if (e.id === el.id || e.type === 'salesBillMatrix' || e.type === 'dynamicList') continue;
      const eBottom = e.y + e.height;
      if (e.y >= matrixBottom) {
        belowReserved = Math.max(belowReserved, eBottom - matrixBottom);
      }
    }
  }
  const pageChunks = computeMatrixPageChunks(el, groups, bH, iH, hasRepeat, belowReserved);
  return { pageChunks, matrixDrivenPages: pageChunks.length, groupCount: groups.length };
}

export function getMatrixDrivenPageCount(
  template: PrintTemplate, ctx: PrintRenderContext, editorMode: boolean,
  bodyH?: number, innerH?: number,
): number {
  const s = computeMatrixPaginationSummary(template, ctx, editorMode, bodyH, innerH);
  return s ? s.matrixDrivenPages : 1;
}

export function getMatrixGroupsForPrintPage(
  summary: MatrixPaginationSummary,
  _groups: SalesBillMatrixGroup[],
  pageIndex1: number,
): MatrixPageChunk {
  return summary.pageChunks[pageIndex1 - 1] ?? { entries: [], showThead: false, startFromTop: false };
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
