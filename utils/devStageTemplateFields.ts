import type { DevStageTemplateFieldDto, ReportFieldDefinition } from '../types';
import { normalizeReportFieldDefinition } from './reportCustomDocField';

/** 开发节点模板字段 → 报工自定义字段定义（配置表 / 登记弹窗复用） */
export function devTemplateFieldToReportField(f: DevStageTemplateFieldDto): ReportFieldDefinition {
  return normalizeReportFieldDefinition({
    id: f.id,
    label: f.label,
    type: f.type ?? 'text',
    required: f.required,
    options: f.options,
    dateWithTime: f.dateWithTime,
    dateAutoFill: f.dateAutoFill,
  });
}

/** 报工自定义字段定义 → 开发节点模板字段（持久化前） */
export function reportFieldToDevTemplateField(
  f: ReportFieldDefinition,
  order: number,
): DevStageTemplateFieldDto {
  const n = normalizeReportFieldDefinition(f);
  return {
    id: n.id,
    label: n.label,
    type: n.type,
    required: !!n.required,
    order,
    options: n.options,
    dateWithTime: n.dateWithTime,
    dateAutoFill: n.dateAutoFill,
  };
}

export function devTemplateFieldsToReportFields(
  fields: DevStageTemplateFieldDto[],
): ReportFieldDefinition[] {
  return [...fields]
    .sort((a, b) => a.order - b.order)
    .map(devTemplateFieldToReportField);
}
