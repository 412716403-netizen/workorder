import React from 'react';

export interface DateCustomFieldConfigCheckboxesProps {
  dateWithTime?: boolean;
  dateAutoFill?: boolean;
  onPatch: (patch: { dateWithTime?: boolean; dateAutoFill?: boolean }) => void;
  className?: string;
}

/**
 * 日期型自定义项在「选项」列的配置：日期+时间、自动填充（系统日期 / 系统日期时间）
 */
export const DateCustomFieldConfigCheckboxes: React.FC<DateCustomFieldConfigCheckboxesProps> = ({
  dateWithTime,
  dateAutoFill,
  onPatch,
  className = '',
}) => (
  <div className={`flex min-w-0 flex-row flex-wrap items-center gap-x-4 gap-y-1 text-xs ${className}`}>
    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap font-bold text-slate-600">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600"
        checked={!!dateWithTime}
        onChange={e => onPatch({ dateWithTime: e.target.checked })}
      />
      日期+时间
    </label>
    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap font-bold text-slate-600">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600"
        checked={!!dateAutoFill}
        onChange={e => onPatch({ dateAutoFill: e.target.checked })}
      />
      自动填充
    </label>
  </div>
);
