import type { PlanFormFieldConfig } from '../types';

export type PlanFormCustomFieldValueType = 'text' | 'date' | 'select' | 'file';

/** 历史 type 含 number；统一为可渲染的类型 */
export function effectivePlanFormFieldType(cf: PlanFormFieldConfig): PlanFormCustomFieldValueType {
  const t = cf.type as string | undefined;
  if (t === 'number') return 'text';
  if (t === 'date' || t === 'select' || t === 'file') return t;
  return 'text';
}

export function normalizePlanFormFieldConfigArray(fields: PlanFormFieldConfig[] | undefined): PlanFormFieldConfig[] {
  return (fields ?? []).map(f =>
    (f.type as string | undefined) === 'number' ? { ...f, type: 'text' as const } : f,
  );
}
