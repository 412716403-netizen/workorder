import React from 'react';
import type { PlanFormFieldConfig, ReportFieldDefinition } from '../types';
import { PlanFormCustomFieldInput } from './PlanFormCustomFieldControls';
import {
  effectiveCustomDocFieldType,
  normalizeReportCustomDataValue,
  normalizeReportFieldDefinition,
} from '../utils/reportCustomDocField';

interface ReportCustomFieldsEditorProps {
  fields: ReportFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  namePrefix?: string;
  inputClassName?: string;
  fileHint?: string;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
}

function reportFieldToPlanFormField(field: ReportFieldDefinition): PlanFormFieldConfig {
  const f = normalizeReportFieldDefinition(field);
  return {
    id: f.id,
    label: f.label,
    type: f.type,
    options: f.options,
    dateWithTime: f.dateWithTime,
    dateAutoFill: f.dateAutoFill,
    showInList: true,
    showInCreate: true,
    showInDetail: true,
  };
}

function coerceStoredValue(field: ReportFieldDefinition, raw: unknown): unknown {
  const f = normalizeReportFieldDefinition(field);
  if (effectiveCustomDocFieldType(f) === 'select' && typeof raw === 'boolean') {
    return normalizeReportCustomDataValue(f, raw);
  }
  return raw;
}

const ReportCustomFieldsEditor: React.FC<ReportCustomFieldsEditorProps> = ({
  fields,
  values,
  onChange,
  namePrefix: _namePrefix,
  fileHint: _fileHint,
  inputClassName = 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none',
  onFilePreview,
}) => {
  void _namePrefix;
  void _fileHint;
  return (
    <>
      {fields.map(field => {
        const cf = reportFieldToPlanFormField(field);
        const value = coerceStoredValue(field, values[field.id]);
        return (
          <div key={field.id} className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">
              {field.label} {field.required && <span className="text-rose-500">*</span>}
            </label>
            <PlanFormCustomFieldInput
              cf={cf}
              value={value}
              onChange={next => onChange(field.id, next)}
              controlClassName={inputClassName}
              onFilePreview={onFilePreview}
            />
          </div>
        );
      })}
    </>
  );
};

export default React.memo(ReportCustomFieldsEditor);
