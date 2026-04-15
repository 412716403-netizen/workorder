import React from 'react';
import type { ReportFieldDefinition } from '../types';

interface ReportCustomFieldsEditorProps {
  fields: ReportFieldDefinition[];
  values: Record<string, any>;
  onChange: (fieldId: string, value: any) => void;
  namePrefix?: string;
  inputClassName?: string;
  fileHint?: string;
}

const ReportCustomFieldsEditor: React.FC<ReportCustomFieldsEditorProps> = ({
  fields,
  values,
  onChange,
  namePrefix = 'stp-field',
  inputClassName = 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none',
  fileHint = '已选择文件，将随报工一并提交',
}) => {
  return (
    <>
      {fields.map(field => (
        <div key={field.id} className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">
            {field.label} {field.required && <span className="text-rose-500">*</span>}
          </label>
          {field.type === 'text' && (
            <input
              tabIndex={-1}
              type="text"
              name={`${namePrefix}-${field.id}`}
              autoComplete="off"
              value={values[field.id] || ''}
              onChange={e => onChange(field.id, e.target.value)}
              className={inputClassName}
            />
          )}
          {field.type === 'number' && (
            <input
              tabIndex={-1}
              type="number"
              name={`${namePrefix}-${field.id}`}
              autoComplete="off"
              value={values[field.id] ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              className={inputClassName}
            />
          )}
          {field.type === 'select' && (
            <select
              tabIndex={-1}
              name={`${namePrefix}-${field.id}`}
              autoComplete="off"
              value={values[field.id] || ''}
              onChange={e => onChange(field.id, e.target.value)}
              className={inputClassName}
            >
              <option value="">请选择...</option>
              {(field.options || []).map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
          {field.type === 'boolean' && (
            <div className="flex items-center gap-3 py-1">
              <button
                tabIndex={-1}
                type="button"
                onClick={() => onChange(field.id, !values[field.id])}
                className={`w-10 h-5 rounded-full relative transition-colors ${values[field.id] ? 'bg-indigo-600' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${values[field.id] ? 'left-5.5' : 'left-0.5'}`} />
              </button>
              <span className="text-[10px] font-bold text-slate-500">{values[field.id] ? '是' : '否'}</span>
            </div>
          )}
          {field.type === 'date' && (
            <input
              tabIndex={-1}
              type="date"
              name={`${namePrefix}-${field.id}`}
              autoComplete="off"
              value={values[field.id] || ''}
              onChange={e => onChange(field.id, e.target.value)}
              className={inputClassName}
            />
          )}
          {field.type === 'file' && (
            <div className="space-y-2">
              <input
                tabIndex={-1}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                autoComplete="off"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    onChange(field.id, '');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => onChange(field.id, reader.result as string);
                  reader.readAsDataURL(file);
                }}
                className="w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-indigo-700"
              />
              {typeof values[field.id] === 'string' &&
                String(values[field.id]).startsWith('data:image') && (
                  <img src={values[field.id]} alt="" className="max-h-28 rounded-lg border border-slate-200 object-contain" />
                )}
              {typeof values[field.id] === 'string' &&
                String(values[field.id]).startsWith('data:') &&
                !String(values[field.id]).startsWith('data:image') && (
                  <p className="text-[10px] text-slate-500">{fileHint}</p>
                )}
            </div>
          )}
        </div>
      ))}
    </>
  );
};

export default React.memo(ReportCustomFieldsEditor);
