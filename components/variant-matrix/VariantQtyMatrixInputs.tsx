import React, { useMemo } from 'react';
import type { AppDictionaries, Product, ProductVariant } from '../../types';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import QtyMatrixTable from './QtyMatrixTable';
import { VariantQtyMatrixHint } from './VariantQtyMatrixHint';
import { psiOrderBillCompactLineInputClass } from '../../styles/uiDensity';
import {
  VARIANT_QTY_MATRIX_CONTAINER_ATTR,
  handleVariantQtyMatrixKeyDown,
} from '../../utils/matrixKeyboardNav';

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
  /** 与 {@link QtyMatrixTable} 的 balancedNumericLayout 一致：通栏、尺码列居中、行斑马纹 */
  balancedNumericLayout?: boolean;
  inputClassName?: string;
  /** 启用方向键在矩阵格间切换焦点（Excel 风格）；默认可编辑矩阵开启，readOnly 时自动关闭 */
  arrowKeyNav?: boolean;
};

const defaultInputClass = `${psiOrderBillCompactLineInputClass} w-[3.25rem] shrink-0 text-left shadow-sm focus:ring-indigo-200`;

const VariantQtyMatrixInputs: React.FC<VariantQtyMatrixInputsProps> = ({
  product,
  dictionaries,
  quantities,
  onVariantQtyChange,
  readOnly = false,
  getCellExtras,
  systemQtyByVariantId,
  compactSizeColumns,
  balancedNumericLayout = false,
  inputClassName = defaultInputClass,
  arrowKeyNav = true,
}) => {
  const layout = useMemo(() => buildVariantQtyMatrixLayout(product, dictionaries), [product, dictionaries]);
  if (!layout) return null;

  const navActive = arrowKeyNav && !readOnly;

  const rows = layout.colorRows.map((row, rowIndex) => {
    let sum = 0;
    const cells = row.variantAtSize.map((v, ci) => {
      if (!v) {
        return (
          <span key={`${row.key}-e-${ci}`} className="text-sm tabular-nums text-slate-300">
            —
          </span>
        );
      }
      const q = quantities[v.id] ?? 0;
      sum += q;
      const extras = getCellExtras?.(v);
      const sys = systemQtyByVariantId?.[v.id];
      const cellColClass = balancedNumericLayout ? 'flex min-w-0 flex-col items-center gap-0.5' : 'flex min-w-0 flex-col gap-0.5';
      const innerRowClass = balancedNumericLayout
        ? 'flex flex-wrap items-center justify-center gap-x-2 gap-y-1'
        : 'flex flex-wrap items-center gap-x-2 gap-y-1';
      const roNumClass = balancedNumericLayout
        ? 'text-base font-black text-slate-900 tabular-nums tracking-tight'
        : 'text-sm font-bold text-slate-800 tabular-nums';
      if (readOnly) {
        return (
          <div key={v.id} className={cellColClass}>
            {sys != null && <span className="text-[9px] text-slate-500">系统 {sys}</span>}
            <div className={innerRowClass}>
              <span className={roNumClass}>{q}</span>
              {extras?.hint != null ? <VariantQtyMatrixHint>{extras.hint}</VariantQtyMatrixHint> : null}
            </div>
          </div>
        );
      }
      return (
        <div key={v.id} className={balancedNumericLayout ? `${cellColClass} w-full` : 'flex min-w-0 flex-col gap-0.5'}>
          {sys != null && <span className="text-[9px] text-slate-500">系统 {sys}</span>}
          <div className={balancedNumericLayout ? `${innerRowClass} w-full` : 'flex flex-wrap items-center gap-x-2 gap-y-1'}>
            <input
              type="number"
              min={0}
              max={extras?.max}
              disabled={extras?.disabled}
              value={q === 0 ? '' : q}
              placeholder={extras?.placeholder ?? '0'}
              {...(navActive
                ? {
                    'data-matrix-row': rowIndex,
                    'data-matrix-col': ci,
                    onKeyDown: handleVariantQtyMatrixKeyDown,
                  }
                : {})}
              onChange={e => {
                const raw = parseInt(e.target.value, 10) || 0;
                const cap = extras?.max;
                const next = cap != null && Number.isFinite(cap) ? Math.min(raw, cap) : raw;
                onVariantQtyChange?.(v.id, next);
              }}
              className={`${inputClassName}${balancedNumericLayout ? ' mx-auto text-center' : ''}${extras?.disabled ? ' opacity-50' : ''}`}
            />
            {extras?.hint != null ? <VariantQtyMatrixHint>{extras.hint}</VariantQtyMatrixHint> : null}
          </div>
        </div>
      );
    });
    return {
      key: row.key,
      colorCell: (
        <div className={`flex items-center gap-2 ${balancedNumericLayout ? 'py-0.5' : ''}`}>
          {row.colorSwatch ? (
            <span
              className={
                balancedNumericLayout
                  ? 'h-5 w-5 shrink-0 rounded-md border border-slate-200/80 shadow-inner'
                  : 'h-4 w-4 shrink-0 rounded-full border border-slate-200'
              }
              style={{ backgroundColor: row.colorSwatch }}
            />
          ) : null}
          <span className={balancedNumericLayout ? 'text-[13px] font-black text-slate-800' : ''}>{row.colorLabel}</span>
        </div>
      ),
      cells,
      subtotalCell: sum,
    };
  });

  const table = (
    <QtyMatrixTable
      sizeHeaders={layout.sizeColumns.map(c => c.header)}
      rows={rows}
      compactSizeColumns={compactSizeColumns}
      balancedNumericLayout={balancedNumericLayout}
    />
  );

  if (!navActive) return table;

  return <div {...{ [VARIANT_QTY_MATRIX_CONTAINER_ATTR]: '' }}>{table}</div>;
};

export default React.memo(VariantQtyMatrixInputs);
