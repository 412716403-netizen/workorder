import React from 'react';
import type { PlanFormFieldConfig, ReportFieldDefinition } from '../types';
import { PlanFormCustomFieldInput } from './PlanFormCustomFieldControls';
import {
  effectiveCustomDocFieldType,
  normalizeReportCustomDataValue,
  normalizeReportFieldDefinition,
} from '../utils/reportCustomDocField';
import { formStandardControlClass, formStandardLabelClass } from '../styles/uiDensity';

interface ReportCustomFieldsEditorProps {
  fields: ReportFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  namePrefix?: string;
  inputClassName?: string;
  fileHint?: string;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
  /** grid：父级为 sm:grid-cols-2；file 类型占满一行 */
  variant?: 'stack' | 'grid';
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
    showInList: false,
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
  inputClassName = formStandardControlClass,
  onFilePreview,
  variant = 'stack',
}) => {
  void _namePrefix;
  void _fileHint;
  return (
    <>
      {fields.map(field => {
        const cf = reportFieldToPlanFormField(field);
        const normalized = normalizeReportFieldDefinition(field);
        const value = coerceStoredValue(field, values[field.id]);
        const isFile = effectiveCustomDocFieldType(normalized) === 'file';
        const wrapClass =
          variant === 'grid' ? `space-y-1 min-w-0 ${isFile ? 'sm:col-span-2' : ''}` : 'space-y-1';
        return (
          <div key={field.id} className={wrapClass}>
            <label className={formStandardLabelClass}>
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
