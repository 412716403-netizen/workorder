import React, { useMemo } from 'react';
import { Package } from 'lucide-react';
import QtyMatrixTable, { type QtyMatrixTableRow } from '../../components/variant-matrix/QtyMatrixTable';
import { VariantQtyMatrixHint } from '../../components/variant-matrix/VariantQtyMatrixHint';
import {
  buildCollabQtyMatrix, collabVariantKey, type BuildCollabQtyMatrixOpts, type CollabReturnRow,
} from './collabHelpers';

function specLabel(v: string | null) {
  if (v == null || v === '') return '—';
  return v;
}

type Props = {
  blockIdx: number;
  selected: boolean;
  productName: string;
  productSku?: string | null;
  /** 单价（元），与图片中「销售价」一致，整单产品一条价；在 showPricing=false 时不使用 */
  unitPrice?: string;
  onUnitPriceChange?: (blockIdx: number, value: string) => void;
  /** 是否显示单价与金额区块，默认 true。转发单等场景不携带价格，应置为 false。 */
  showPricing?: boolean;
  rows: CollabReturnRow[];
  capColumnTitle: string;
  ringClass: string;
  onUpdateRow: (blockIdx: number, rowIdx: number, qty: string) => void;
  /** 与派发 payload / 本企业商品规格矩阵一致的色、码列顺序 */
  matrixOrder?: BuildCollabQtyMatrixOpts;
};

const CollabPeerQtyMatrixBlock: React.FC<Props> = ({
  blockIdx,
  selected,
  productName,
  productSku,
  unitPrice = '',
  onUnitPriceChange,
  showPricing = true,
  rows,
  capColumnTitle,
  ringClass,
  onUpdateRow,
  matrixOrder,
}) => {
  const matrixKey = rows.map(r => collabVariantKey(r)).sort().join('|');
  const orderKey = `${matrixOrder?.preferredColorOrder?.join('\t') ?? ''}|${matrixOrder?.preferredSizeOrder?.join('\t') ?? ''}`;
  const { colors, sizes, cellRowIdx } = useMemo(
    () => buildCollabQtyMatrix(
      rows.map(r => ({ colorName: r.colorName, sizeName: r.sizeName })),
      matrixOrder,
    ),
    [matrixKey, orderKey],
  );

  const sizeHeaders = useMemo(() => sizes.map(s => specLabel(s)), [sizes]);

  const qtyMatrixRows = useMemo((): QtyMatrixTableRow[] => {
    return colors.map((c, ci) => {
      let rowSum = 0;
      const cells = sizes.map((_, si) => {
        const rIdx = cellRowIdx[ci]?.[si] ?? null;
        if (rIdx == null) {
          return <span key={`e-${ci}-${si}`} className="text-sm text-slate-300">—</span>;
        }
        const row = rows[rIdx]!;
        rowSum += Number(row.qty) || 0;
        return (
          <div key={`c-${ci}-${si}`} className="flex min-w-0 flex-wrap items-center justify-start gap-x-2 gap-y-1">
            <input
              type="number"
              min={0}
              max={row.maxReturnable}
              value={row.qty}
              onChange={e => onUpdateRow(blockIdx, rIdx, e.target.value)}
              disabled={!selected}
              className={`h-9 w-[3.25rem] shrink-0 rounded-lg border border-slate-200 bg-slate-50/90 px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none transition-shadow disabled:opacity-50 ${ringClass}`}
            />
            <VariantQtyMatrixHint>
              {capColumnTitle} {row.maxReturnable}
            </VariantQtyMatrixHint>
          </div>
        );
      });
      return {
        key: JSON.stringify(c),
        colorCell: <span>{specLabel(c)}</span>,
        cells,
        subtotalCell: rowSum,
      };
    });
  }, [colors, sizes, cellRowIdx, rows, blockIdx, selected, capColumnTitle, ringClass, onUpdateRow]);

  const unitNum = Number(unitPrice);
  const hasUnit = Number.isFinite(unitNum) && unitNum >= 0;

  const totalQty = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.qty) || 0), 0),
    [rows],
  );
  const totalAmount = hasUnit ? totalQty * unitNum : 0;

  return (
    <div className="border-t border-slate-100 bg-white">
      {/* 目标商品 + 单价 / 总数 / 金额 */}
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3.5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-xl bg-white p-2 text-slate-500 shadow-sm ring-1 ring-slate-200/80">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">目标商品</div>
              <div className="mt-0.5 truncate text-sm font-black text-slate-900">
                {productName || '—'}
                {productSku ? <span className="ml-2 text-xs font-bold text-slate-500">({productSku})</span> : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 md:shrink-0">
            {showPricing && (
              <>
                <div className="flex min-w-[5.5rem] flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-wide text-slate-400">单价（元）</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={unitPrice}
                    onChange={e => onUnitPriceChange?.(blockIdx, e.target.value)}
                    disabled={!selected}
                    className={`h-9 w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-900 shadow-sm outline-none transition-shadow disabled:opacity-50 ${ringClass}`}
                    placeholder="0"
                  />
                </div>
                <div className="hidden h-9 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
              </>
            )}
            <div className="flex min-w-[5rem] flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">总数</span>
              <span className="inline-flex h-9 min-w-[5.5rem] items-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-black tabular-nums text-indigo-700 shadow-sm">
                {totalQty}
                <span className="ml-1 text-xs font-bold text-indigo-600/90">件</span>
              </span>
            </div>
            {showPricing && (
              <>
                <div className="hidden h-9 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
                <div className="flex min-w-[5.5rem] flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">金额（元）</span>
                  <span
                    className={`inline-flex h-9 min-w-[6.5rem] items-center rounded-lg border px-2.5 text-sm font-black tabular-nums shadow-sm ${
                      hasUnit
                        ? 'border-indigo-200/90 bg-indigo-50/90 text-indigo-800'
                        : 'border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    {hasUnit ? totalAmount.toFixed(2) : '—'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-1 pt-3">
        <h4 className="text-xs font-black text-slate-700">数量明细（有颜色尺码）</h4>
      </div>

      <div className="px-4 pb-4">
        <QtyMatrixTable sizeHeaders={sizeHeaders} rows={qtyMatrixRows} />
      </div>
    </div>
  );
};

export default React.memo(CollabPeerQtyMatrixBlock);
