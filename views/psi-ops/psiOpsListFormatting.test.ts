import { describe, expect, it } from 'vitest';
import type { PlanFormFieldConfig } from '../../types';
import { compactPsiListCustomValue, psiCustomFieldHasFilledDisplayValue } from './psiOpsListFormatting';

function baseCf(over: Partial<PlanFormFieldConfig> = {}): PlanFormFieldConfig {
  return {
    id: 'field1',
    label: '字段1',
    showInList: true,
    showInCreate: true,
    showInDetail: true,
    ...over,
  };
}

describe('psiCustomFieldHasFilledDisplayValue', () => {
  it('与 compact 占位「—」一致：空值不展示', () => {
    const cf = baseCf({ id: 'a', type: 'text' });
    expect(compactPsiListCustomValue(cf, null)).toBe('—');
    expect(compactPsiListCustomValue(cf, '')).toBe('—');
    expect(psiCustomFieldHasFilledDisplayValue(cf, null)).toBe(false);
    expect(psiCustomFieldHasFilledDisplayValue(cf, '')).toBe(false);
  });

  it('非空文本为 true', () => {
    const cf = baseCf({ type: 'text' });
    expect(psiCustomFieldHasFilledDisplayValue(cf, 'hello')).toBe(true);
    expect(compactPsiListCustomValue(cf, 'hello')).not.toBe('—');
  });

  it('附件 data URL 为 true', () => {
    const cf = baseCf({ type: 'file' });
    expect(psiCustomFieldHasFilledDisplayValue(cf, 'data:image/png;base64,xx')).toBe(true);
  });

  it('日期有值时与 compact 一致', () => {
    const cf = baseCf({ type: 'date', dateWithTime: false });
    const v = '2024-01-15';
    expect(psiCustomFieldHasFilledDisplayValue(cf, v)).toBe(compactPsiListCustomValue(cf, v) !== '—');
  });
});
