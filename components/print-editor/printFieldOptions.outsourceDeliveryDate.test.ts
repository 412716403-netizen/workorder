import { describe, expect, it } from 'vitest';
import { buildPrintFieldOptions } from './printFieldOptions';

function hasOutsourceDispatchDeliveryDateField(showOutsourceDispatchDeliveryDate: boolean): boolean {
  const options = buildPrintFieldOptions({
    planCustomFields: [],
    showOutsourceDispatchDeliveryDate,
  });
  return options.some(
    o => o.group === '外协发出' && o.value === '外协发出.deliveryDate' && o.label === '交货日期',
  );
}

describe('buildPrintFieldOptions outsource dispatch delivery date switch', () => {
  it('未勾选「外协发出显示交货日期」时，不暴露交货日期字段', () => {
    expect(hasOutsourceDispatchDeliveryDateField(false)).toBe(false);
  });

  it('勾选「外协发出显示交货日期」时，暴露交货日期字段', () => {
    expect(hasOutsourceDispatchDeliveryDateField(true)).toBe(true);
  });
});

