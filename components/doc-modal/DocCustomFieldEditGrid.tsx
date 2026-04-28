import React from 'react';
import type { PlanFormFieldConfig } from '../../types';
import { PlanFormCustomFieldInput } from '../PlanFormCustomFieldControls';

export interface DocCustomFieldEditGridProps {
  fields: PlanFormFieldConfig[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  controlClassName: string;
  /** 可选：仅渲染 `include(cf) === true` 的字段 */
  includeField?: (cf: PlanFormFieldConfig) => boolean;
  /** 为 false 时不画顶部分割线（由父级统一包一层 border-t） */
  showTopDivider?: boolean;
}

/** 编辑区纵向自定义字段表单项（label + PlanFormCustomFieldInput） */
export const DocCustomFieldEditGrid: React.FC<DocCustomFieldEditGridProps> = ({
  fields,
  values,
  onChange,
  controlClassName,
  includeField,
  showTopDivider = true,
}) => (
  <div
    className={
      showTopDivider
        ? 'flex flex-col gap-3 border-t border-slate-200/80 pt-3'
        : 'flex flex-col gap-3'
    }
  >
    {fields
      .filter(cf => (includeField ? includeField(cf) : true))
      .map(cf => (
        <div key={cf.id} className="min-w-0 space-y-1">
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
          <PlanFormCustomFieldInput
            cf={cf}
            value={values[cf.id]}
            onChange={v => onChange(cf.id, v)}
            controlClassName={controlClassName}
          />
        </div>
      ))}
  </div>
);
