import { describe, expect, it } from 'vitest';
import type { DevStageDto, DevStageTemplateDto } from '../types';
import { DevStageStatus } from '../types';
import { getStageRegisteredDisplayFields, isDevStageFieldValueFilled } from './devStageDisplay';

const baseStage = (fields: DevStageDto['fields']): DevStageDto => ({
  id: 'st1',
  name: '设计',
  status: DevStageStatus.IN_PROGRESS,
  order: 0,
  updatedAt: '2026-06-05T00:00:00.000Z',
  fields,
  attachments: [],
});

describe('isDevStageFieldValueFilled', () => {
  it('treats whitespace-only as empty', () => {
    expect(isDevStageFieldValueFilled('  ')).toBe(false);
  });

  it('accepts data URL file values', () => {
    expect(isDevStageFieldValueFilled('data:image/png;base64,abc')).toBe(true);
  });
});

describe('getStageRegisteredDisplayFields', () => {
  const templates: DevStageTemplateDto[] = [
    {
      id: 'tpl1',
      name: '设计',
      order: 0,
      fields: [
        { id: 'a', label: '设计稿', type: 'text', required: false, order: 1 },
        { id: 'b', label: '备注', type: 'text', required: false, order: 0 },
      ],
    },
  ];

  it('sorts by template order and skips empty values', () => {
    const stage = baseStage([
      { id: 'f1', label: '设计稿', value: 'v1', type: 'text' },
      { id: 'f2', label: '备注', value: '', type: 'text' },
      { id: 'f3', label: '其他', value: 'legacy', type: 'text' },
    ]);
    const rows = getStageRegisteredDisplayFields(stage, templates);
    expect(rows.map((r) => r.field.label)).toEqual(['设计稿', '其他']);
    expect(rows[0].tplField?.label).toBe('设计稿');
  });
});
