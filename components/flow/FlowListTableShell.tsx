import React from 'react';

export interface FlowListTableShellProps {
  children: React.ReactNode;
  footer: React.ReactNode;
  className?: string;
}

/**
 * 流水列表卡片：上方可滚动 table，底部 shrink-0 合计栏（不随 tbody 滚走）。
 * 表头冻结：滚动时让内部 table 的 thead 单元格吸顶。这些流水列表统一使用
 * `bg-slate-50` 的表头，故在此给 th 补背景与底线，避免 sticky 时行内容透出。
 */
const STICKY_THEAD =
  '[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-slate-50 [&_thead_th]:border-b [&_thead_th]:border-slate-200';

const FlowListTableShell: React.FC<FlowListTableShellProps> = ({
  children,
  footer,
  className = '',
}) => (
  <div
    className={`border border-slate-200 rounded-2xl overflow-hidden flex flex-col min-h-0 max-h-full ${className}`}
  >
    <div className={`flex-1 overflow-auto min-h-0 ${STICKY_THEAD}`}>{children}</div>
    {footer}
  </div>
);

export default FlowListTableShell;
