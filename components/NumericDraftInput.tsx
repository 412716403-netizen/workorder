import React, { useEffect, useState } from 'react';

export type NumericDraftInputProps = {
  /** 外部 value 变化时重置草稿（如切换选中元素） */
  id: string;
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  /** 失焦时输入为空或无效时的回退值；默认保留当前 value */
  emptyFallback?: number;
  className?: string;
  placeholder?: string;
  title?: string;
};

/** 数值输入：编辑中用本地草稿，避免清空时被 `|| 0` 立即回显 0（打印模板尺寸/边距等） */
export function NumericDraftInput({
  id,
  value,
  onCommit,
  min,
  max,
  emptyFallback,
  className,
  placeholder,
  title,
}: NumericDraftInputProps) {
  const [draft, setDraft] = useState(() => String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [id, value]);

  const commit = () => {
    const raw = String(draft).replace(/,/g, '.').trim();
    let next = emptyFallback ?? value;
    if (raw !== '' && raw !== '-' && raw !== '.') {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) {
        next = n;
        if (min != null) next = Math.max(min, next);
        if (max != null) next = Math.min(max, next);
      }
    }
    onCommit(next);
    setDraft(String(next));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      title={title}
      placeholder={placeholder}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
