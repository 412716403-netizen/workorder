import React from 'react';
import type { QtyMatrixTableRow } from '../../components/variant-matrix/QtyMatrixTable';
import { buildCollabQtyMatrix, type BuildCollabQtyMatrixOpts } from './collabHelpers';

export type CollabPayloadItem = {
  colorName?: string | null;
  sizeName?: string | null;
  quantity?: unknown;
  unitPrice?: unknown;
  amount?: unknown;
};

export function collabSpecLabel(v: string | null) {
  if (v == null || v === '') return '—';
  return v;
}

/** 协作 payload items 中首个有效单价（元/件），用于回传单等整单汇总行 */
export function firstFiniteCollabUnitPrice(items: CollabPayloadItem[] | undefined | null): number | null {
  if (!items?.length) return null;
  for (const it of items) {
    const n = Number(it?.unitPrice);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** 回传单 / 协作单据详情：矩阵下方「数量 | 单价 | 本行金额」只读汇总（与 CollabPeerQtyMatrixBlock 视觉对齐） */
export function CollabDocQtyPriceFooter({
  lineQty,
  resolvedUnitPrice,
  lineAmount,
}: {
  lineQty: number;
  resolvedUnitPrice: number | null;
  lineAmount: number | null;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-slate-100 pt-4">
      <div className="flex min-w-[5rem] flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">数量</span>
        <span className="inline-flex h-9 min-w-[5.5rem] items-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-black tabular-nums text-indigo-700 shadow-sm">
          {lineQty}
          <span className="ml-1 text-xs font-bold text-indigo-600/90">件</span>
        </span>
      </div>
      <div className="hidden h-9 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
      <div className="flex min-w-[5.5rem] flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">单价（元/件）</span>
        <div className="inline-flex h-9 min-w-[6.5rem] items-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-900 shadow-sm tabular-nums">
          {resolvedUnitPrice != null ? resolvedUnitPrice.toFixed(2) : '—'}
        </div>
      </div>
      <div className="hidden h-9 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
      <div className="flex min-w-[5.5rem] flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">本行金额（元）</span>
        <span
          className={`inline-flex h-9 min-w-[6.5rem] items-center rounded-lg border px-2.5 text-sm font-black tabular-nums shadow-sm ${
            lineAmount != null
              ? 'border-indigo-200/90 bg-indigo-50/90 text-indigo-800'
              : 'border-slate-200 bg-white text-slate-400'
          }`}
        >
          {lineAmount != null ? lineAmount.toFixed(2) : '—'}
        </span>
      </div>
    </div>
  );
}

/** 协作 payload 行（颜色名/尺码名）→ 与全站一致的只读 QtyMatrixTable 行列数据（单价/金额不在格内展示，由单据详情底部汇总行展示） */
export function collabPayloadItemsToQtyMatrixProps(
  items: CollabPayloadItem[],
  options?: BuildCollabQtyMatrixOpts,
): { sizeHeaders: string[]; rows: QtyMatrixTableRow[] } {
  if (!Array.isArray(items) || items.length === 0) {
    return { sizeHeaders: [], rows: [] };
  }
  const matrixInputs = items.map(it => ({
    colorName: it.colorName ?? null,
    sizeName: it.sizeName ?? null,
  }));
  const matrixOpts: BuildCollabQtyMatrixOpts = {
    preferredColorOrder: options?.preferredColorOrder,
    preferredSizeOrder: options?.preferredSizeOrder,
  };
  const { colors, sizes } = buildCollabQtyMatrix(matrixInputs, matrixOpts);
  const sizeHeaders = sizes.map(s => collabSpecLabel(s));

  const matchesForCell = (c: string | null, s: string | null) =>
    items.filter(it => (it.colorName ?? null) === (c ?? null) && (it.sizeName ?? null) === (s ?? null));

  const rows: QtyMatrixTableRow[] = colors.map((c, ci) => {
    let rowSum = 0;
    const cells = sizes.map((_, si) => {
      const matches = matchesForCell(c, sizes[si] ?? null);
      if (matches.length === 0) {
        return <span key={`e-${ci}-${si}`} className="text-sm text-slate-300">—</span>;
      }
      const q = matches.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
      rowSum += q;

      return (
        <div key={`c-${ci}-${si}`} className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-bold text-slate-800 tabular-nums">{q}</span>
        </div>
      );
    });
    return {
      key: JSON.stringify(c),
      colorCell: <span>{collabSpecLabel(c)}</span>,
      cells,
      subtotalCell: <span className="tabular-nums">{rowSum}</span>,
    };
  });

  return { sizeHeaders, rows };
}
