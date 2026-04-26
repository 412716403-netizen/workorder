import type { CustomDocFieldType, PlanFormFieldConfig } from '../types';
import { effectiveCustomDocFieldType } from './reportCustomDocField';

export type PlanFormCustomFieldValueType = CustomDocFieldType;

/** 历史 type 含 number；统一为可渲染的类型（与分类扩展字段 effective 规则一致） */
export function effectivePlanFormFieldType(cf: PlanFormFieldConfig): PlanFormCustomFieldValueType {
  return effectiveCustomDocFieldType(cf);
}

export function normalizePlanFormFieldConfigArray(fields: PlanFormFieldConfig[] | undefined): PlanFormFieldConfig[] {
  return (fields ?? []).map(f =>
    (f.type as string | undefined) === 'number' ? { ...f, type: 'text' as const } : f,
  );
}
