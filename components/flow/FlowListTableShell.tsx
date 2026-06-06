import React from 'react';

export interface FlowListTableShellProps {
  children: React.ReactNode;
  footer: React.ReactNode;
  className?: string;
}

/**
 * 流水列表卡片：上方可滚动 table，底部 shrink-0 合计栏（不随 tbody 滚走）。
 */
const FlowListTableShell: React.FC<FlowListTableShellProps> = ({
  children,
  footer,
  className = '',
}) => (
  <div
    className={`border border-slate-200 rounded-2xl overflow-hidden flex flex-col min-h-0 max-h-full ${className}`}
  >
    <div className="flex-1 overflow-auto min-h-0">{children}</div>
    {footer}
  </div>
);

export default FlowListTableShell;
