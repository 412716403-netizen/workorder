import React from 'react';

const shellClass = 'rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5';

export interface DocSummaryCardProps {
  /** 左侧主信息区（本组件外包 `min-w-0 flex-1 space-y-3`） */
  main: React.ReactNode;
  /** 右侧合计/统计列 */
  side?: React.ReactNode;
  /** 追加到外壳 class，如 `mb-5` */
  className?: string;
}

/** 生产/外协/返工/报工等详情摘要卡：双栏 + 右侧统计槽 */
export const DocSummaryCard: React.FC<DocSummaryCardProps> = ({ main, side, className }) => (
  <div className={className ? `${shellClass} ${className}` : shellClass}>
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="min-w-0 flex-1 space-y-3">{main}</div>
      {side != null ? (
        <div className="flex shrink-0 flex-wrap gap-6 border-t border-slate-200/80 pt-3 text-sm md:border-t-0 md:border-l md:border-slate-200/80 md:pt-0 md:pl-6">
          {side}
        </div>
      ) : null}
    </div>
  </div>
);
