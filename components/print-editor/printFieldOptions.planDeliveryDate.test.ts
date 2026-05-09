import { describe, expect, it } from 'vitest';
import { buildPrintFieldOptions } from './printFieldOptions';

function hasPlanDueDateField(showPlanDeliveryDate: boolean): boolean {
  const options = buildPrintFieldOptions({
    planCustomFields: [],
    showPlanDeliveryDate,
  });
  return options.some(
    o => o.group === '计划' && o.value === '计划.dueDate' && o.label === '交货日期',
  );
}

describe('buildPrintFieldOptions plan delivery date switch', () => {
  it('未勾选「列表显示 · 显示交货日期」时，不暴露计划交货日期字段', () => {
    expect(hasPlanDueDateField(false)).toBe(false);
  });

  it('勾选「列表显示 · 显示交货日期」时，暴露 {{计划.dueDate}} 对应项', () => {
    expect(hasPlanDueDateField(true)).toBe(true);
  });
});
