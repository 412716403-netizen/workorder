import { describe, expect, it } from 'vitest';
import {
  devTemplateFieldToReportField,
  devTemplateFieldsToReportFields,
  reportFieldToDevTemplateField,
} from './devStageTemplateFields';
import type { DevStageTemplateFieldDto } from '../types';

describe('devStageTemplateFields', () => {
  it('maps template field to report field with defaults', () => {
    const dto: DevStageTemplateFieldDto = {
      id: 'f1',
      label: '备注',
      type: 'text',
      required: false,
      order: 0,
    };
    const rf = devTemplateFieldToReportField(dto);
    expect(rf.id).toBe('f1');
    expect(rf.label).toBe('备注');
    expect(rf.type).toBe('text');
  });

  it('round-trips select field with options', () => {
    const rf = devTemplateFieldToReportField({
      id: 'f2',
      label: '结果',
      type: 'select',
      required: true,
      order: 1,
      options: ['合格', '不合格'],
    });
    const back = reportFieldToDevTemplateField(rf, 1);
    expect(back.type).toBe('select');
    expect(back.options).toEqual(['合格', '不合格']);
    expect(back.required).toBe(true);
    expect(back.order).toBe(1);
  });

  it('sorts by order when converting list', () => {
    const list = devTemplateFieldsToReportFields([
      { id: 'b', label: 'B', type: 'text', required: false, order: 1 },
      { id: 'a', label: 'A', type: 'text', required: false, order: 0 },
    ]);
    expect(list.map((f) => f.id)).toEqual(['a', 'b']);
  });
});
