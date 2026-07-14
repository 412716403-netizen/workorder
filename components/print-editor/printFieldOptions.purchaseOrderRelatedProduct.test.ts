import { describe, expect, it } from 'vitest';
import { buildPrintFieldOptions } from './printFieldOptions';

describe('buildPrintFieldOptions purchase order related product switch', () => {
  it('未开启「关联产品」时，不暴露采购订单关联产品字段', () => {
    const options = buildPrintFieldOptions({
      planCustomFields: [],
      showPurchaseOrderRelatedProduct: false,
    });
    expect(
      options.some(
        o => o.group === '采购订单' && o.value === '采购订单.relatedProduct' && o.label === '关联产品',
      ),
    ).toBe(false);
  });

  it('开启「关联产品」时，暴露 {{采购订单.relatedProduct}}', () => {
    const options = buildPrintFieldOptions({
      planCustomFields: [],
      showPurchaseOrderRelatedProduct: true,
    });
    expect(
      options.some(
        o => o.group === '采购订单' && o.value === '采购订单.relatedProduct' && o.label === '关联产品',
      ),
    ).toBe(true);
  });
});
