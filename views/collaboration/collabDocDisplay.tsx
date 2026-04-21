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

/** 协作 payload 行（颜色名/尺码名）→ 与全站一致的只读 QtyMatrixTable 行列数据 */
export function collabPayloadItemsToQtyMatrixProps(
  items: CollabPayloadItem[],
  options?: { showPricing?: boolean } & BuildCollabQtyMatrixOpts,
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

      let up: number | null = null;
      for (const m of matches) {
        const n = Number(m.unitPrice);
        if (Number.isFinite(n)) {
          up = n;
          break;
        }
      }
      let amtSum = 0;
      let hasAmt = false;
      for (const m of matches) {
        const n = Number(m.amount);
        if (Number.isFinite(n)) {
          amtSum += n;
          hasAmt = true;
        }
      }
      const priceBits: string[] = [];
      if (up != null && Number.isFinite(up)) priceBits.push(`单价 ${up}`);
      if (hasAmt) priceBits.push(`金额 ${amtSum}`);
      const showP = options?.showPricing === true && priceBits.length > 0;

      return (
        <div key={`c-${ci}-${si}`} className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-bold text-slate-800 tabular-nums">{q}</span>
          {showP ? (
            <span className="text-[10px] text-slate-400 tabular-nums leading-snug">{priceBits.join(' · ')}</span>
          ) : null}
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
