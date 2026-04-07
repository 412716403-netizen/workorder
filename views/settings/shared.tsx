import React, { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

export function PlanFormStyleSelectOptionRow({
  serverValue,
  onCommit,
  onRemove,
}: {
  key?: React.Key;
  serverValue: string;
  onCommit: (text: string) => void;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState(serverValue);
  useEffect(() => setLocal(serverValue), [serverValue]);
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(local)}
        className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-400"
        placeholder="选项文案"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded shrink-0"
        title="删除"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** 扩展字段名称/标签：失焦再保存，避免每字请求打断中文输入法 */
export function ExtFieldLabelInput({
  inputKey,
  label,
  onPersist,
  placeholder,
  className,
  emptyHint = '名称不能为空',
}: {
  inputKey: string;
  label: string;
  onPersist: (trimmed: string) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  emptyHint?: string;
}) {
  const [local, setLocal] = useState(label);
  useEffect(() => {
    setLocal(label);
  }, [inputKey, label]);

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const t = local.trim();
        const cur = (label || '').trim();
        if (t === cur) return;
        if (!t) {
          toast.error(emptyHint);
          setLocal(label);
          return;
        }
        void onPersist(t);
      }}
      className={className}
    />
  );
}

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
