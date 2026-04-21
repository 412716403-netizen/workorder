import React, { useMemo } from 'react';
import type { AppDictionaries, Product, ProductVariant } from '../../types';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import QtyMatrixTable from './QtyMatrixTable';
import { VariantQtyMatrixHint } from './VariantQtyMatrixHint';

export type VariantQtyMatrixCellExtras = {
  max?: number;
  disabled?: boolean;
  /** 输入框右侧辅助文案（如「最多 N」「可回 N」） */
  hint?: React.ReactNode;
  placeholder?: string;
};

export type VariantQtyMatrixInputsProps = {
  product: Product;
  dictionaries: AppDictionaries;
  quantities: Record<string, number | undefined>;
  onVariantQtyChange?: (variantId: string, qty: number) => void;
  readOnly?: boolean;
  getCellExtras?: (variant: ProductVariant) => VariantQtyMatrixCellExtras | undefined;
  /** 盘点等：各规格系统库存参考，显示在输入框上方 */
  systemQtyByVariantId?: Record<string, number | null | undefined>;
  compactSizeColumns?: boolean;
  inputClassName?: string;
};

const defaultInputClass =
  'h-9 w-[3.25rem] shrink-0 rounded-lg border border-slate-200 bg-slate-50/90 px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200';

const VariantQtyMatrixInputs: React.FC<VariantQtyMatrixInputsProps> = ({
  product,
  dictionaries,
  quantities,
  onVariantQtyChange,
  readOnly = false,
  getCellExtras,
  systemQtyByVariantId,
  compactSizeColumns,
  inputClassName = defaultInputClass,
}) => {
  const layout = useMemo(() => buildVariantQtyMatrixLayout(product, dictionaries), [product, dictionaries]);
  if (!layout) return null;

  const rows = layout.colorRows.map(row => {
    let sum = 0;
    const cells = row.variantAtSize.map((v, ci) => {
      if (!v) return <span key={`${row.key}-e-${ci}`} className="text-sm text-slate-300">—</span>;
      const q = quantities[v.id] ?? 0;
      sum += q;
      const extras = getCellExtras?.(v);
      const sys = systemQtyByVariantId?.[v.id];
      if (readOnly) {
        return (
          <div key={v.id} className="flex min-w-0 flex-col gap-0.5">
            {sys != null && <span className="text-[9px] text-slate-500">系统 {sys}</span>}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-bold text-slate-800 tabular-nums">{q}</span>
              {extras?.hint != null ? <VariantQtyMatrixHint>{extras.hint}</VariantQtyMatrixHint> : null}
            </div>
          </div>
        );
      }
      return (
        <div key={v.id} className="flex min-w-0 flex-col gap-0.5">
          {sys != null && <span className="text-[9px] text-slate-500">系统 {sys}</span>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <input
              type="number"
              min={0}
              max={extras?.max}
              disabled={extras?.disabled}
              value={q === 0 ? '' : q}
              placeholder={extras?.placeholder ?? '0'}
              onChange={e => {
                const raw = parseInt(e.target.value, 10) || 0;
                const cap = extras?.max;
                const next = cap != null && Number.isFinite(cap) ? Math.min(raw, cap) : raw;
                onVariantQtyChange?.(v.id, next);
              }}
              className={`${inputClassName}${extras?.disabled ? ' opacity-50' : ''}`}
            />
            {extras?.hint != null ? <VariantQtyMatrixHint>{extras.hint}</VariantQtyMatrixHint> : null}
          </div>
        </div>
      );
    });
    return {
      key: row.key,
      colorCell: (
        <div className="flex items-center gap-2">
          {row.colorSwatch ? (
            <span className="h-4 w-4 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: row.colorSwatch }} />
          ) : null}
          <span>{row.colorLabel}</span>
        </div>
      ),
      cells,
      subtotalCell: sum,
    };
  });

  return (
    <QtyMatrixTable
      sizeHeaders={layout.sizeColumns.map(c => c.header)}
      rows={rows}
      compactSizeColumns={compactSizeColumns}
    />
  );
};

export default React.memo(VariantQtyMatrixInputs);
