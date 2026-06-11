import { describe, expect, it } from 'vitest';
import { buildPrintFieldOptions } from './printFieldOptions';

function purchaseBillRelatedProductFields(showPurchaseBillRelatedProduct: boolean) {
  const options = buildPrintFieldOptions({
    purchaseBillCustomFields: [],
    showPurchaseBillRelatedProduct,
  });
  return {
    header: options.some(
      o => o.group === '采购入库' && o.value === '采购入库.relatedProduct' && o.label === '关联产品',
    ),
    lineName: options.some(
      o => o.group === '采购入库明细' && o.value === '行.relatedProductName' && o.label === '关联产品名称',
    ),
    lineSku: options.some(
      o => o.group === '采购入库明细' && o.value === '行.relatedProductSku' && o.label === '关联产品货号',
    ),
  };
}

describe('buildPrintFieldOptions purchase bill related product switch', () => {
  it('未开启「关联产品」时，不暴露采购入库关联产品字段', () => {
    const f = purchaseBillRelatedProductFields(false);
    expect(f.header).toBe(false);
    expect(f.lineName).toBe(false);
    expect(f.lineSku).toBe(false);
  });

  it('开启「关联产品」时，暴露表头与明细关联产品字段', () => {
    const f = purchaseBillRelatedProductFields(true);
    expect(f.header).toBe(true);
    expect(f.lineName).toBe(true);
    expect(f.lineSku).toBe(true);
  });
});
