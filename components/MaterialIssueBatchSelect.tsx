import React, { useMemo } from 'react';
import type { Product, ProductCategory } from '../types';
import { BATCH_NO_UNTAGGED, categoryUsesBatchManagement, normalizeBatchNo } from '../types';
import { useWarehouseBatchOptions } from '../hooks/useBatchPicker';

/** `default`：表格/弹窗内紧凑行（略小字号）；`formRow`：与单据行同高框体，批次字号为 xs */
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
  /**
   * 显式提供"已发批次"清单（仅 `mode="issue"` 生效）：
   * 用于外协物料退回——按发给该工厂的所有批次显示，**不**受当前仓库可用余量约束。
   * 提供后将**完全替换** `getStockBatches` 与 `mergeBatches` 的常规来源。
   */
  dispatchedBatchOptions?: string[];
  /** 为 true 时下拉项不再追加「（余 X）」提示文案 */
  hideStockHint?: boolean;
  /** 自定义 placeholder（仅 `mode="return"`）；默认 "批号（可手输）" */
  returnPlaceholder?: string;
}

/** 与单行 `<input type="number">` 同高，避免原生 select 默认行高更矮/更乱 */
const ISSUE_SELECT_DEFAULT =
  'h-9 min-h-9 w-full box-border rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold leading-tight text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200';
const ISSUE_SELECT_FORM_ROW =
  'w-full h-[42px] box-border bg-white border border-slate-200 rounded-xl px-2.5 text-xs font-bold leading-tight text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500';

const RETURN_INPUT_DEFAULT =
  'h-9 min-h-9 w-full box-border rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold leading-tight text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200';
const RETURN_INPUT_FORM_ROW =
  'w-full h-[42px] box-border bg-white border border-slate-200 rounded-xl px-2.5 text-xs font-bold leading-tight text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500';

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
  dispatchedBatchOptions,
  hideStockHint = false,
  returnPlaceholder,
}) => {
  const cat = categories.find(c => c.id === product?.categoryId);
  const enabled = categoryUsesBatchManagement(cat);
  // 提供 dispatchedBatchOptions 时跳过常规仓库批次拉取，避免对当前仓库余量产生依赖。
  const useDispatchedSource = mode === 'issue' && Array.isArray(dispatchedBatchOptions);
  const { options: stockOptions, loading } = useWarehouseBatchOptions(
    /** return 模式：可手输，同时预加载可选批次供 datalist 提示 */
    enabled && !useDispatchedSource && (mode === 'issue' || mode === 'return'),
    product?.id,
    warehouseId || undefined,
    undefined,
    mergeBatches,
  );

  /** 已发批次：去重 + 归一 + 哨兵兜底，按 zh-CN 排序，余量字段置为 0 仅作占位（hideStockHint 时不展示）。 */
  const dispatchedOptions = useMemo(() => {
    if (!useDispatchedSource) return [] as { batchNo: string; stock: number }[];
    const seen = new Set<string>();
    const list: { batchNo: string; stock: number }[] = [];
    for (const raw of dispatchedBatchOptions ?? []) {
      const bn = normalizeBatchNo(raw) ?? BATCH_NO_UNTAGGED;
      if (seen.has(bn)) continue;
      seen.add(bn);
      list.push({ batchNo: bn, stock: 0 });
    }
    list.sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN'));
    return list;
  }, [useDispatchedSource, dispatchedBatchOptions]);

  const options = useDispatchedSource ? dispatchedOptions : stockOptions;
  const showStockHint = !hideStockHint && !useDispatchedSource;

  const labelClass =
    controlVariant === 'formRow'
      ? 'text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1'
      : 'text-[9px] font-black text-slate-400 uppercase';

  const issueSelectClass = controlVariant === 'formRow' ? ISSUE_SELECT_FORM_ROW : ISSUE_SELECT_DEFAULT;
  const returnInputClass = controlVariant === 'formRow' ? RETURN_INPUT_FORM_ROW : RETURN_INPUT_DEFAULT;

  if (!enabled) return null;

  const renderOptionLabel = (o: { batchNo: string; stock: number }) =>
    showStockHint ? `${o.batchNo}（余 ${o.stock}）` : o.batchNo;

  if (mode === 'return') {
    return (
      <div className={`space-y-1 ${className}`}>
        {!hideLabel && <label className={labelClass}>批次</label>}
        <input
          type="text"
          list={`batch-datalist-${product?.id ?? 'x'}`}
          value={value}
          onChange={e => onChange(normalizeBatchNo(e.target.value) ?? '')}
          placeholder={returnPlaceholder ?? '批号（可手输）'}
          className={returnInputClass}
        />
        <datalist id={`batch-datalist-${product?.id ?? 'x'}`}>
          {options.map(o => (
            <option key={o.batchNo} value={o.batchNo}>
              {renderOptionLabel(o)}
            </option>
          ))}
        </datalist>
      </div>
    );
  }

  /** 仓库未必填的兜底：dispatched 模式下只要 product 有效就允许选择，无需限定 warehouse。 */
  const placeholderLabel = useDispatchedSource
    ? options.length === 0
      ? '暂无已发批次'
      : '选择批次'
    : loading
      ? '加载中…'
      : warehouseId
        ? '选择批次'
        : '先选仓库';

  return (
    <div className={`space-y-1 ${className}`}>
      {!hideLabel && <label className={labelClass}>批次</label>}
      <select
        value={value}
        onChange={e => onChange(normalizeBatchNo(e.target.value) ?? '')}
        disabled={!useDispatchedSource && !warehouseId}
        className={issueSelectClass}
      >
        <option value="">{placeholderLabel}</option>
        {options.map(o => (
          <option key={o.batchNo} value={o.batchNo}>
            {renderOptionLabel(o)}
          </option>
        ))}
      </select>
    </div>
  );
};
