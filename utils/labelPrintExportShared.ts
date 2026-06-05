import type {
  PrintRenderContext,
  PrintListRow,
} from '../types';
import { collectLabelQrPayloads } from './labelPrintQr';

export { collectLabelQrPayloads, resolveQrCells } from './labelPrintQr';

export function buildLabelPageContexts(ctx: PrintRenderContext): PrintRenderContext[] {
  if (ctx.labelPerRow && ctx.printListRows?.length) {
    const { listRow: _omit, ...base } = ctx;
    const total = ctx.printListRows.length;
    return ctx.printListRows.map((row, index) => ({
      ...base,
      page: { current: index + 1, total },
      listRow: row as PrintListRow,
    }));
  }
  if (ctx.labelPerVirtualBatch && ctx.virtualBatchRows?.length) {
    const { virtualBatch: _omit, ...base } = ctx;
    const total = ctx.virtualBatchRows.length;
    return ctx.virtualBatchRows.map((row, index) => ({
      ...base,
      page: { current: index + 1, total },
      virtualBatch: row,
    }));
  }
  return [ctx];
}

/** @deprecated 使用 collectLabelQrPayloads */
export function collectLabelQrValues(template: import('../types').PrintTemplate, pageContexts: PrintRenderContext[]): string[] {
  return collectLabelQrPayloads(template, pageContexts);
}
