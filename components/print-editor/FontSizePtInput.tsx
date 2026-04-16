import React, { useEffect, useState } from 'react';

type FontSizePtInputProps = {
  /** 用于外部 value 变化时重置草稿（如切换选中元素） */
  id: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  /** 失焦时四舍五入到 0.5pt（销售单矩阵等） */
  roundToHalf?: boolean;
  className?: string;
  title?: string;
};

export function FontSizePtInput({
  id,
  value,
  min,
  max,
  onCommit,
  roundToHalf,
  className,
  title,
}: FontSizePtInputProps) {
  const [draft, setDraft] = useState(() => String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [id, value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      title={title}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const raw = String(draft).replace(/,/g, '.').trim();
        const n = parseFloat(raw);
        let next = value;
        if (Number.isFinite(n)) {
          let x = Math.min(max, Math.max(min, n));
          if (roundToHalf) x = Math.round(x * 2) / 2;
          next = x;
        }
        onCommit(next);
        setDraft(String(next));
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
