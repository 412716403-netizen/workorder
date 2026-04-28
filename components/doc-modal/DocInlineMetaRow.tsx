import React from 'react';

const rowClass =
  'flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-slate-400 uppercase';

export interface DocInlineMetaRowProps {
  children: React.ReactNode;
  className?: string;
}

/** 摘要卡内时间/经办/自定义只读等 meta 行 */
export const DocInlineMetaRow: React.FC<DocInlineMetaRowProps> = ({ children, className }) => (
  <div className={className ? `${rowClass} ${className}` : rowClass}>{children}</div>
);
