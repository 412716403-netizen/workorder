import type { DevStageDto, DevStageTemplateDto, DevStageTemplateFieldDto } from '../types';

export type StageDisplayFieldRow = {
  field: DevStageDto['fields'][number];
  tplField?: DevStageTemplateFieldDto;
};

/** 节点登记字段是否有可展示的值（含文件 data URL） */
export function isDevStageFieldValueFilled(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** 按节点库模板顺序排列、仅含已填写的登记字段 */
export function getStageRegisteredDisplayFields(
  stage: DevStageDto,
  templates: DevStageTemplateDto[],
): StageDisplayFieldRow[] {
  const filled = stage.fields.filter((f) => isDevStageFieldValueFilled(f.value));
  if (filled.length === 0) return [];

  const tpl = templates.find((t) => t.name === stage.name);
  if (!tpl?.fields?.length) {
    return filled.map((field) => ({ field }));
  }

  const sortedTpl = [...tpl.fields].sort((a, b) => a.order - b.order);
  const rows: StageDisplayFieldRow[] = [];
  const used = new Set<string>();

  for (const tplField of sortedTpl) {
    const field = filled.find((f) => f.label.trim() === tplField.label.trim());
    if (field) {
      rows.push({ field, tplField });
      used.add(field.id);
    }
  }

  for (const field of filled) {
    if (!used.has(field.id)) rows.push({ field });
  }

  return rows;
}

export function stageHasRegisteredContent(stage: DevStageDto): boolean {
  return stage.fields.some((f) => isDevStageFieldValueFilled(f.value));
}
