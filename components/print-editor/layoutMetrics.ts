import type { PrintRenderContext, PrintTemplate } from '../../types';
import { getListDrivenPageCount } from '../../utils/printListPagination';

const zeroMargins = { top: 0, bottom: 0, left: 0, right: 0 };

const MAX_PRINT_OUTPUT_PAGES = 50;

/** 非编辑预览/打印时的物理页数：运行时 ctx.page.total（若有）与动态列表明细分页取较大者，否则至少 1 页 */
export function getPrintOutputPageCount(template: PrintTemplate, ctx: PrintRenderContext, editorMode?: boolean): number {
  if (editorMode) return 1;
  let base = 1;
  const raw = ctx.page?.total;
  if (raw != null && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    if (n >= 1) base = n;
  }
  const listPages = getListDrivenPageCount(template, ctx, false);
  return Math.min(MAX_PRINT_OUTPUT_PAGES, Math.max(base, listPages));
}

export function getPaperMarginsMm(t: PrintTemplate) {
  return t.paperMarginsMm ?? zeroMargins;
}

export function getPrintLayoutMetrics(t: PrintTemplate) {
  const headerH = t.header?.heightMm ?? 0;
  const footerH = t.footer?.heightMm ?? 0;
  const m = getPaperMarginsMm(t);
  const innerW = Math.max(1, t.paperSize.widthMm - m.left - m.right);
  const innerH = Math.max(1, t.paperSize.heightMm - m.top - m.bottom);
  const bodyW = innerW;
  const bodyH = Math.max(1, innerH - headerH - footerH);
  return {
    headerH,
    footerH,
    bodyW,
    bodyH,
    totalW: t.paperSize.widthMm,
    totalH: t.paperSize.heightMm,
    margins: m,
    innerW,
    innerH,
  };
}
