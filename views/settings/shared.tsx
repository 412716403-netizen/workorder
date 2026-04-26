import React from 'react';
import { Plus } from 'lucide-react';
import {
  BlurPersistLabelInput,
  BlurPersistSelectOptionRow,
} from '../../components/form-config/BlurPersistFieldInputs';

/** @deprecated 使用 `BlurPersistSelectOptionRow`，此处保留别名供设置页既有 import */
export const PlanFormStyleSelectOptionRow = BlurPersistSelectOptionRow;

/** 扩展字段名称/标签：失焦再保存，避免每字请求打断中文输入法 */
export const ExtFieldLabelInput = BlurPersistLabelInput;

/** 产品分类扩展字段·下拉选项 */
export function ProductCategorySelectOptions({
  catId,
  fieldId,
  options,
  onPersist,
}: {
  catId: string;
  fieldId: string;
  options: string[];
  onPersist: (catId: string, fieldId: string, next: string[]) => void;
}) {
  const opts = options ?? [];

  return (
    <div className="w-full mt-2 pt-2 border-t border-slate-100">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">选项（下拉时）</p>
      <div className="min-w-[180px] space-y-1.5">
        {opts.map((opt, idx) => (
          <PlanFormStyleSelectOptionRow
            key={`${fieldId}-opt-${idx}`}
            serverValue={opt}
            onCommit={(text) => {
              const v = text.trim();
              if (!v) {
                onPersist(catId, fieldId, opts.filter((_, i) => i !== idx));
              } else if (v !== (opt || '').trim()) {
                const next = [...opts];
                next[idx] = v;
                onPersist(catId, fieldId, next);
              }
            }}
            onRemove={() => onPersist(catId, fieldId, opts.filter((_, i) => i !== idx))}
          />
        ))}
        <button
          type="button"
          onClick={() => onPersist(catId, fieldId, [...opts, '新选项'])}
          className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" /> 添加选项
        </button>
      </div>
    </div>
  );
}

export function NodeReportTemplateSelectOptions({
  nodeId,
  fieldId,
  options,
  onPersist,
}: {
  nodeId: string;
  fieldId: string;
  options: string[];
  onPersist: (nodeId: string, fieldId: string, next: string[]) => void;
}) {
  const opts = options ?? [];
  return (
    <div className="w-full mt-2 pt-2 border-t border-slate-100 md:col-span-3">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">下拉选项</p>
      <div className="min-w-[180px] space-y-1.5">
        {opts.map((opt, idx) => (
          <PlanFormStyleSelectOptionRow
            key={`${fieldId}-opt-${idx}`}
            serverValue={opt}
            onCommit={(text) => {
              const v = text.trim();
              if (!v) {
                onPersist(nodeId, fieldId, opts.filter((_, i) => i !== idx));
              } else if (v !== (opt || '').trim()) {
                const next = [...opts];
                next[idx] = v;
                onPersist(nodeId, fieldId, next);
              }
            }}
            onRemove={() => onPersist(nodeId, fieldId, opts.filter((_, i) => i !== idx))}
          />
        ))}
        <button
          type="button"
          onClick={() => onPersist(nodeId, fieldId, [...opts, '新选项'])}
          className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" /> 添加选项
        </button>
      </div>
    </div>
  );
}
