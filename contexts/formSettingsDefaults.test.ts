import { describe, it, expect } from 'vitest';
import {
  normalizeDecimals,
  normalizeOutsourceFormSettings,
  normalizePurchaseOrderFormSettings,
  normalizePurchaseBillFormSettings,
  normalizeSalesOrderFormSettings,
  normalizeSalesBillFormSettings,
} from './formSettingsDefaults';

describe('normalizeDecimals', () => {
  it('converts string quantity to number', () => {
    const input = [{ quantity: '100', name: 'test' }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBe(100);
    expect(result[0].name).toBe('test');
  });

  it('converts string purchasePrice to number', () => {
    const input = [{ purchasePrice: '12.50' }];
    const result = normalizeDecimals(input);
    expect(result[0].purchasePrice).toBe(12.5);
  });

  it('converts non-numeric string to 0', () => {
    const input = [{ quantity: 'abc' }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBe(0);
  });

  it('leaves numeric values unchanged', () => {
    const input = [{ quantity: 42, salesPrice: 9.99 }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBe(42);
    expect(result[0].salesPrice).toBe(9.99);
  });

  it('leaves null/undefined values unchanged', () => {
    const input = [{ quantity: null, salesPrice: undefined }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBeNull();
    expect(result[0].salesPrice).toBeUndefined();
  });

  it('handles empty array', () => {
    expect(normalizeDecimals([])).toEqual([]);
  });

  it('normalizes nested items array', () => {
    const input = [{ items: [{ quantity: '50', unitPrice: '3.5' }] }];
    const result = normalizeDecimals(input);
    expect(result[0].items[0].quantity).toBe(50);
    expect(result[0].items[0].unitPrice).toBe(3.5);
  });

  it('does not affect non-decimal keys', () => {
    const input = [{ name: '123', productId: '456' }];
    const result = normalizeDecimals(input);
    expect(result[0].name).toBe('123');
    expect(result[0].productId).toBe('456');
  });
});

describe('normalizeOutsourceFormSettings', () => {
  it('injects default outsourceCenterPrint without auto template whitelist', () => {
    const n = normalizeOutsourceFormSettings({});
    expect(n.showOutsourceDispatchDeliveryDate).toBe(false);
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.outsourceCenterPrint?.receiveFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.showPrintButton).not.toBe(false);
  });

  it('strips removed builtin-outsource-dispatch-v1 from dispatch whitelist', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: {
        dispatchFlowDetail: { allowedTemplateIds: ['builtin-outsource-dispatch-v1', 'custom-1'] },
      },
    });
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toEqual(['custom-1']);
  });

  it('v1-only dispatch whitelist becomes empty', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: {
        dispatchFlowDetail: { allowedTemplateIds: ['builtin-outsource-dispatch-v1'] },
      },
    });
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toBeUndefined();
  });

  it('empty dispatch slot has no allowed ids', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: { dispatchFlowDetail: {} },
    });
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toBeUndefined();
  });

  it('preserves tenant whitelist without prepending builtins', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: { dispatchFlowDetail: { allowedTemplateIds: ['custom-1'] } },
    });
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toEqual(['custom-1']);
  });

  it('preserves receive whitelist as provided', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: { receiveFlowDetail: { allowedTemplateIds: ['recv-custom'] } },
    });
    expect(n.outsourceCenterPrint?.receiveFlowDetail?.allowedTemplateIds).toEqual(['recv-custom']);
  });
});

describe('normalizePurchaseOrderFormSettings listPrint', () => {
  it('does not inject allowed ids when unset', () => {
    expect(normalizePurchaseOrderFormSettings({}).listPrint?.allowedTemplateIds).toBeUndefined();
  });

  it('keeps tenant whitelist', () => {
    const n = normalizePurchaseOrderFormSettings({ listPrint: { allowedTemplateIds: ['a'] } });
    expect(n.listPrint?.allowedTemplateIds).toEqual(['a']);
  });
});

describe('normalizeSalesOrderFormSettings listPrint', () => {
  it('does not inject allowed ids when unset', () => {
    expect(normalizeSalesOrderFormSettings({}).listPrint?.allowedTemplateIds).toBeUndefined();
  });

  it('keeps tenant whitelist', () => {
    const n = normalizeSalesOrderFormSettings({ listPrint: { allowedTemplateIds: ['b'] } });
    expect(n.listPrint?.allowedTemplateIds).toEqual(['b']);
  });
});

describe('normalizePurchaseBillFormSettings listPrint', () => {
  it('does not inject allowed ids when unset', () => {
    expect(normalizePurchaseBillFormSettings({}).listPrint?.allowedTemplateIds).toBeUndefined();
  });

  it('keeps tenant whitelist', () => {
    const n = normalizePurchaseBillFormSettings({ listPrint: { allowedTemplateIds: ['c'] } });
    expect(n.listPrint?.allowedTemplateIds).toEqual(['c']);
  });
});

describe('normalizeSalesBillFormSettings listPrint', () => {
  it('does not inject allowed ids when unset', () => {
    expect(normalizeSalesBillFormSettings({}).listPrint?.allowedTemplateIds).toBeUndefined();
  });

  it('keeps tenant whitelist', () => {
    const n = normalizeSalesBillFormSettings({ listPrint: { allowedTemplateIds: ['d'] } });
    expect(n.listPrint?.allowedTemplateIds).toEqual(['d']);
  });
});
