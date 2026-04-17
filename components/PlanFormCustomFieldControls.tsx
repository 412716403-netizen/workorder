import React, { useLayoutEffect, useRef } from 'react';
import type { PlanFormFieldConfig } from '../types';
import { getFileExtFromDataUrl } from '../utils/fileHelpers';
import { effectivePlanFormFieldType } from '../utils/planFormCustomField';
import {
  formatLocalDateTimeZh,
  localNowForDatetimeLocal,
  localTodayYmd,
  toDatetimeLocalInputValue,
} from '../utils/localDateTime';

const FILE_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx';

const PlanFormDateCustomInput: React.FC<{
  cf: PlanFormFieldConfig;
  value: unknown;
  onChange: (next: unknown) => void;
  controlClassName: string;
}> = ({ cf, value, onChange, controlClassName }) => {
  const withTime = !!cf.dateWithTime;
  const auto = !!cf.dateAutoFill;
  const strVal = value === undefined || value === null ? '' : String(value);
  const filledOnce = useRef(false);
  useLayoutEffect(() => {
    filledOnce.current = false;
  }, [cf.id]);
  useLayoutEffect(() => {
    if (!auto) return;
    if (value != null && String(value).trim() !== '') return;
    if (filledOnce.current) return;
    filledOnce.current = true;
    onChange(withTime ? localNowForDatetimeLocal() : localTodayYmd());
  }, [auto, withTime, cf.id, value, onChange]);
  const inputType = withTime ? 'datetime-local' : 'date';
  const inputValue = withTime ? toDatetimeLocalInputValue(strVal) : strVal.slice(0, 10);
  return (
    <input
      type={inputType}
      className={controlClassName}
      value={inputValue}
      step={withTime ? 60 : undefined}
      onChange={e => onChange(e.target.value)}
    />
  );
};

export interface PlanFormCustomFieldInputProps {
  cf: PlanFormFieldConfig;
  value: unknown;
  onChange: (next: unknown) => void;
  /** 文本 / 日期 / 下拉 */
  controlClassName: string;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
}

export const PlanFormCustomFieldInput: React.FC<PlanFormCustomFieldInputProps> = ({
  cf,
  value,
  onChange,
  controlClassName,
  onFilePreview,
}) => {
  const t = effectivePlanFormFieldType(cf);
  const strVal = value === undefined || value === null ? '' : String(value);

  if (t === 'date') {
    return <PlanFormDateCustomInput cf={cf} value={value} onChange={onChange} controlClassName={controlClassName} />;
  }
  if (t === 'select') {
    return (
      <select className={controlClassName} value={(value as string) ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">请选择</option>
        {(cf.options ?? []).map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (t === 'file') {
    const dataStr = typeof value === 'string' ? value : '';
    const openPreview = (url: string, kind: 'image' | 'pdf') => {
      if (onFilePreview) onFilePreview(url, kind);
      else window.open(url, '_blank', 'noopener,noreferrer');
    };
    const onThumbClick = () => {
      if (!dataStr.startsWith('data:')) return;
      if (dataStr.startsWith('data:image/')) openPreview(dataStr, 'image');
      else if (dataStr.startsWith('data:application/pdf')) openPreview(dataStr, 'pdf');
      else window.open(dataStr, '_blank', 'noopener,noreferrer');
    };
    return (
      <div className="space-y-2">
        <input
          type="file"
          accept={FILE_ACCEPT}
          className="w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-indigo-700"
          onChange={e => {
            const file = e.target.files?.[0];
            if (!file) {
              onChange('');
              return;
            }
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result as string);
            reader.readAsDataURL(file);
          }}
        />
        {dataStr.startsWith('data:image/') && (
          <button
            type="button"
            onClick={onThumbClick}
            className="block max-w-full overflow-hidden rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="点击查看大图"
          >
            <img src={dataStr} alt="" className="max-h-32 max-w-full object-contain" />
          </button>
        )}
        {dataStr.startsWith('data:') && !dataStr.startsWith('data:image/') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">已选择附件</span>
            <button type="button" onClick={onThumbClick} className="text-xs font-bold text-indigo-600 hover:underline">
              点击查看
            </button>
            <a
              href={dataStr}
              download={`${cf.label}.${getFileExtFromDataUrl(dataStr)}`}
              className="text-xs font-bold text-indigo-600 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              下载
            </a>
          </div>
        )}
      </div>
    );
  }
  return (
    <input
      type="text"
      className={controlClassName}
      value={strVal}
      onChange={e => onChange(e.target.value)}
      placeholder={cf.label}
    />
  );
};

export interface PlanFormCustomFieldReadonlyProps {
  cf: PlanFormFieldConfig;
  value: unknown;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
}

export const PlanFormCustomFieldReadonly: React.FC<PlanFormCustomFieldReadonlyProps> = ({ cf, value, onFilePreview }) => {
  const t = effectivePlanFormFieldType(cf);
  const str = value === undefined || value === null ? '' : String(value);
  if (str === '') return <span className="text-sm font-bold text-slate-400">—</span>;

  if (t === 'date') {
    const display =
      str.includes('T') || /\d{4}-\d{2}-\d{2}\s+\d{1,2}:/.test(str) ? formatLocalDateTimeZh(str) : str.slice(0, 10);
    return <span className="text-sm font-bold text-slate-800">{display || str}</span>;
  }

  if (t === 'file' && str.startsWith('data:image/')) {
    const open = () => {
      if (onFilePreview) onFilePreview(str, 'image');
      else window.open(str, '_blank', 'noopener,noreferrer');
    };
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={open}
          className="overflow-hidden rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="点击查看"
        >
          <img src={str} alt="" className="h-20 max-w-[220px] object-contain" />
        </button>
        <a
          href={str}
          download={`${cf.label}.${getFileExtFromDataUrl(str)}`}
          className="text-xs font-bold text-indigo-600 hover:underline"
          onClick={e => e.stopPropagation()}
        >
          下载
        </a>
      </div>
    );
  }
  if (t === 'file' && str.startsWith('data:application/pdf')) {
    const open = () => {
      if (onFilePreview) onFilePreview(str, 'pdf');
      else window.open(str, '_blank', 'noopener,noreferrer');
    };
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={open} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
          点击查看
        </button>
        <a href={str} download={`${cf.label}.pdf`} className="text-xs font-bold text-indigo-600 hover:underline" onClick={e => e.stopPropagation()}>
          下载
        </a>
      </div>
    );
  }
  if (t === 'file' && str.startsWith('data:')) {
    const open = () => {
      if (onFilePreview) onFilePreview(str, 'pdf');
      else window.open(str, '_blank', 'noopener,noreferrer');
    };
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={open} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
          点击查看
        </button>
        <a
          href={str}
          download={`${cf.label}.${getFileExtFromDataUrl(str)}`}
          className="text-xs font-bold text-indigo-600 hover:underline"
          onClick={e => e.stopPropagation()}
        >
          下载
        </a>
      </div>
    );
  }

  return <span className="text-sm font-bold text-slate-800">{str}</span>;
};
