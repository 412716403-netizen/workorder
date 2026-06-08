import React from 'react';
import { X } from 'lucide-react';

interface WidgetShellProps {
  title: string;
  /** 标题旁待办红点（如消息中心有待处理项） */
  titleDot?: boolean;
  editing?: boolean;
  onRemove?: () => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const WidgetShell: React.FC<WidgetShellProps> = ({
  title,
  titleDot,
  editing,
  onRemove,
  headerExtra,
  children,
  className = '',
}) => (
  <div
    className={`flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
      editing ? 'cursor-move select-none ring-1 ring-emerald-200' : ''
    } ${className}`}
    title={editing ? '编辑态：在卡片空白处拖动可移动，拖右下角可缩放' : undefined}
  >
    <div
      className={`flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-2.5 ${
        editing ? 'bg-slate-50/80' : ''
      }`}
    >
      <span className="h-4 w-1 rounded-full bg-emerald-500" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <h3 className="truncate text-sm font-bold text-slate-800">{title}</h3>
        {titleDot && (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-rose-500 ring-2 ring-white"
            aria-label="有待处理消息"
          />
        )}
      </div>
      <div className="workbench-no-drag ml-auto flex shrink-0 items-center gap-1">
        {headerExtra}
        {editing && (
          <span className="text-[10px] font-medium text-emerald-500">可拖动</span>
        )}
        {editing && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-500"
            aria-label="移除组件"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
  </div>
);

export default WidgetShell;
