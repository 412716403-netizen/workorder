import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/** 下拉选项：本地编辑、失焦再提交，避免父级每字刷新打断中文输入法 */
export function BlurPersistSelectOptionRow({
  serverValue,
  onCommit,
  onRemove,
}: {
  serverValue: string;
  onCommit: (text: string) => void;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState(serverValue);
  useEffect(() => {
    setLocal(serverValue);
  }, [serverValue]);

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onCommit(local)}
        className="min-w-0 flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-400"
        placeholder="选项文案"
      />
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
        title="删除"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** 扩展字段标签：失焦再提交，避免每字同步到父级（含 API 刷新）打断中文输入法 */
export function BlurPersistLabelInput({
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
      onChange={e => setLocal(e.target.value)}
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
