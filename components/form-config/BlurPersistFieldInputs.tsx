import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/** 下拉选项：本地编辑；草稿同步父级，失焦/卸载时再持久化，避免中文输入法被打断且切换页不丢字 */
export function BlurPersistSelectOptionRow({
  serverValue,
  onCommit,
  onDraftChange,
  onRemove,
}: {
  serverValue: string;
  onCommit: (text: string) => void;
  /** 每次键入同步到父级草稿（不触发远端保存），防止未失焦时其它操作读到旧的「新选项」 */
  onDraftChange?: (text: string) => void;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState(serverValue);
  const localRef = useRef(local);
  localRef.current = local;
  const serverRef = useRef(serverValue);
  serverRef.current = serverValue;
  const composingRef = useRef(false);

  useEffect(() => {
    setLocal(serverValue);
  }, [serverValue]);

  useEffect(() => {
    return () => {
      const text = localRef.current;
      if (text !== serverRef.current) {
        onCommit(text);
      }
    };
    // 仅在卸载时冲刷；onCommit 由调用方保证稳定或可接受最新闭包
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount flush
  }, []);

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={local}
        onChange={e => {
          const v = e.target.value;
          setLocal(v);
          if (!composingRef.current) onDraftChange?.(v);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={e => {
          composingRef.current = false;
          const v = e.currentTarget.value;
          setLocal(v);
          onDraftChange?.(v);
        }}
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
  const localRef = useRef(local);
  localRef.current = local;
  const labelRef = useRef(label);
  labelRef.current = label;

  useEffect(() => {
    setLocal(label);
  }, [inputKey, label]);

  useEffect(() => {
    return () => {
      const t = localRef.current.trim();
      const cur = (labelRef.current || '').trim();
      if (t && t !== cur) {
        void onPersist(t);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount flush
  }, [inputKey]);

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
