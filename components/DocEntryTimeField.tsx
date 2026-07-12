import React from 'react';
import { CalendarClock } from 'lucide-react';
import { formStandardControlClass, formStandardLabelClass } from '../styles/uiDensity';

export type DocEntryTimeMode = 'date' | 'datetime';

export interface DocEntryTimeFieldProps {
  mode?: DocEntryTimeMode;
  label?: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
  disabled?: boolean;
}

/** 单据入单时间：date（YYYY-MM-DD）或 datetime（datetime-local） */
const DocEntryTimeField: React.FC<DocEntryTimeFieldProps> = ({
  mode = 'date',
  label = '创建时间',
  value,
  onChange,
  className,
  disabled = false,
}) => {
  return (
    <div className={className ?? 'space-y-1'}>
      <label className={`flex items-center gap-1.5 ${formStandardLabelClass}`}>
        <CalendarClock className="h-3 w-3" />
        {label}
      </label>
      <input
        type={mode === 'datetime' ? 'datetime-local' : 'date'}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={formStandardControlClass}
      />
    </div>
  );
};

export default DocEntryTimeField;
