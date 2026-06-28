import React from 'react';
import { X } from 'lucide-react';

interface WidgetShellProps {
  title: string;
  /** 标题旁待办红点（如消息中心有待处理项） */
  titleDot?: boolean;
  editing?: boolean;
  /** 首页固定组件：不可拖动/移除 */
  layoutLocked?: boolean;
  onRemove?: () => void;
  headerExtra?: React.ReactNode;
  /** 附加在 headerExtra 容器上的类名 */
  headerExtraClassName?: string;
  /** 标题 h3 额外类名（默认 flex-1 占满剩余空间前段） */
  titleClassName?: string;
  children: React.ReactNode;
  className?: string;
}

const WidgetShell: React.FC<WidgetShellProps> = ({
  title,
  titleDot,
  editing,
  layoutLocked,
  onRemove,
  headerExtra,
  headerExtraClassName,
  titleClassName,
  children,
  className = '',
}) => (
  <div
    className={`flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
      editing && !layoutLocked ? 'cursor-move select-none ring-1 ring-emerald-200' : ''
    } ${className}`}
    title={
      editing && !layoutLocked
        ? '编辑态：在卡片空白处拖动可移动，拖右下角可缩放'
        : undefined
    }
  >
    <div
      className={`flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-2.5 min-w-0 ${
        editing ? 'bg-slate-50/80' : ''
      }`}
    >
      <span className="h-4 w-1 shrink-0 rounded-full bg-emerald-500" aria-hidden />
      <h3
        className={`min-w-0 truncate text-sm font-bold text-slate-800 ${
          titleClassName ?? 'flex-1'
        }`}
      >
        {title}
      </h3>
      {titleDot && (
        <span
          className="-ml-1 h-2 w-2 shrink-0 rounded-full bg-rose-500 ring-2 ring-white"
          aria-label="有待处理消息"
        />
      )}
      <div
        className={`workbench-no-drag ml-auto flex items-center justify-end overflow-hidden ${
          headerExtraClassName ?? 'max-w-[55%] shrink-0 sm:max-w-none'
        }`}
      >
        {editing ? (
          <>
            {!layoutLocked && (
              <span className="hidden whitespace-nowrap text-[10px] font-medium text-emerald-500 sm:inline">
                可拖动
              </span>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-100"
                aria-label="移除组件"
              >
                <X className="h-3.5 w-3.5" />
                移除
              </button>
            )}
          </>
        ) : (
          headerExtra
        )}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
  </div>
);

export default WidgetShell;
