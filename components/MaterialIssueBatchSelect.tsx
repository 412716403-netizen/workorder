import React from 'react';
import type { Product, ProductCategory } from '../types';
import { categoryUsesBatchManagement, normalizeBatchNo } from '../types';
import { useWarehouseBatchOptions } from '../hooks/useBatchPicker';

/** `default`：表格/弹窗内紧凑行；`formRow`：与进销存单据明细行输入框（rounded-xl + py-2.5 + text-sm）一致 */
export type MaterialIssueBatchControlVariant = 'default' | 'formRow';

export interface MaterialIssueBatchSelectProps {
  product: Product | undefined;
  categories: ProductCategory[];
  warehouseId: string;
  value: string;
  onChange: (batchNo: string) => void;
  /** `issue`：仅从下拉选择已有批次（领料/退料/销售出库/调拨等）；`return`：可手输 + datalist（仅采购入库等「新建批号」场景） */
  mode?: 'issue' | 'return';
  className?: string;
  /** 为 true 时不渲染内置「批次」文案：父级已有表头或 `<label>`（如销售/采购明细行）时传入，避免重复 */
  hideLabel?: boolean;
  /** 与本地 PSI 索引合并的批次余量（如工单中心与上下文快照对齐） */
  mergeBatches?: { batchNo: string; stock: number }[];
  /** 控件视觉规格，默认与工单领料表等紧凑格一致 */
  controlVariant?: MaterialIssueBatchControlVariant;
}

/** 与单行 `<input type="number">` 同高，避免原生 select 默认行高更矮/更乱 */
const ISSUE_SELECT_DEFAULT =
  'h-9 min-h-9 w-full box-border rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold leading-tight text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200';
const ISSUE_SELECT_FORM_ROW =
  'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500';

const RETURN_INPUT_DEFAULT =
  'h-9 min-h-9 w-full box-border rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold leading-tight text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200';
const RETURN_INPUT_FORM_ROW =
  'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500';

/**
 * 启用 `categoryUsesBatchManagement` 时渲染。
 * `issue`：仅下拉的 `<select>`，选项来自 `getStockBatches` 并与 `mergeBatches` 按批号合并余量。
 * `return`：`<input list>` 可手输批号，datalist 提示可选批次（用于采购入库写入新批号）。
 */
export const MaterialIssueBatchSelect: React.FC<MaterialIssueBatchSelectProps> = ({
  product,
  categories,
  warehouseId,
  value,
  onChange,
  mode = 'issue',
  className = '',
  hideLabel = false,
  mergeBatches,
  controlVariant = 'default',
}) => {
  const cat = categories.find(c => c.id === product?.categoryId);
  const enabled = categoryUsesBatchManagement(cat);
  const { options, loading } = useWarehouseBatchOptions(
    /** return 模式：可手输，同时预加载可选批次供 datalist 提示 */
    enabled && (mode === 'issue' || mode === 'return'),
    product?.id,
    warehouseId || undefined,
    undefined,
    mergeBatches,
  );

  const labelClass =
    controlVariant === 'formRow'
      ? 'text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1'
      : 'text-[9px] font-black text-slate-400 uppercase';

  const issueSelectClass = controlVariant === 'formRow' ? ISSUE_SELECT_FORM_ROW : ISSUE_SELECT_DEFAULT;
  const returnInputClass = controlVariant === 'formRow' ? RETURN_INPUT_FORM_ROW : RETURN_INPUT_DEFAULT;

  if (!enabled) return null;

  if (mode === 'return') {
    return (
      <div className={`space-y-1 ${className}`}>
        {!hideLabel && <label className={labelClass}>批次</label>}
        <input
          type="text"
          list={`batch-datalist-${product?.id ?? 'x'}`}
          value={value}
          onChange={e => onChange(normalizeBatchNo(e.target.value) ?? '')}
          placeholder="批号（可手输）"
          className={returnInputClass}
        />
        <datalist id={`batch-datalist-${product?.id ?? 'x'}`}>
          {options.map(o => (
            <option key={o.batchNo} value={o.batchNo}>
              {o.batchNo}（余 {o.stock}）
            </option>
          ))}
        </datalist>
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {!hideLabel && <label className={labelClass}>批次</label>}
      <select
        value={value}
        onChange={e => onChange(normalizeBatchNo(e.target.value) ?? '')}
        disabled={!warehouseId}
        className={issueSelectClass}
      >
        <option value="">{loading ? '加载中…' : warehouseId ? '选择批次' : '先选仓库'}</option>
        {options.map(o => (
          <option key={o.batchNo} value={o.batchNo}>
            {o.batchNo}（余 {o.stock}）
          </option>
        ))}
      </select>
    </div>
  );
};
